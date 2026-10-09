-- List only active, permitted blueprint choices for the authenticated
-- document creator. Catalogue RLS remains admin-only.
create or replace function public.onosign_available_document_blueprints(
  p_document_id uuid
) returns table (
  blueprint_id uuid,
  blueprint_name text,
  blueprint_type text,
  threshold_eur numeric
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_doc public.documents%rowtype;
  v_workspace public.workspaces%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  select * into v_doc from public.documents where id = p_document_id;
  if not found or v_doc.created_by is distinct from (select auth.uid())
    or v_doc.status is distinct from 'draft'
    or v_doc.document_type not in ('DI','DR')
  then raise exception 'Document unavailable'; end if;
  select * into v_workspace from public.workspaces where id = v_doc.workspace_id;
  if not found or v_workspace.organization_id is distinct from v_doc.organization_id
    or v_workspace.type not in ('hotel','head_office','head_office_department','sarh')
    or not exists (
      select 1 from public.workspace_members m
      where m.workspace_id = v_doc.workspace_id
        and m.user_id = (select auth.uid())
    )
  then raise exception 'Workspace unavailable'; end if;
  return query
    select b.id,b.name,b.document_type,b.financial_threshold_eur
    from public.signature_blueprints b
    left join public.signature_blueprint_overrides o
      on o.blueprint_id = b.id and o.workspace_id = v_doc.workspace_id
    where b.organization_id = v_doc.organization_id
      and b.document_type = v_doc.document_type
      and b.is_active = true
      and coalesce(o.is_enabled,true) = true
      and b.scope = case when v_workspace.type = 'hotel'
                         then 'hotels' else 'head_office' end
    order by b.name,b.id;
end;
$$;
revoke all on function public.onosign_available_document_blueprints(uuid) from public;
grant execute on function public.onosign_available_document_blueprints(uuid) to authenticated;
