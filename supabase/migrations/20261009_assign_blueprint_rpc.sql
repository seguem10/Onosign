-- Atomic catalogue selection for an existing draft.
-- Does not create recipients or authorize sending.
create or replace function public.onosign_assign_blueprint(
  p_document_id uuid,
  p_blueprint_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.documents%rowtype;
  v_blueprint public.signature_blueprints%rowtype;
  v_workspace public.workspaces%rowtype;
  v_user uuid := (select auth.uid());
  v_enabled boolean;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_doc from public.documents
    where id = p_document_id for update;
  if not found then raise exception 'Document unavailable'; end if;
  if v_doc.created_by <> v_user then
    raise exception 'Only the document creator can select its workflow';
  end if;
  if v_doc.status <> 'draft' then raise exception 'Document is not a draft'; end if;
  if v_doc.signature_blueprint_id is not null then
    raise exception 'Workflow is already selected';
  end if;
  if not exists (
    select 1 from public.workspace_members m
    where m.user_id = v_user and m.workspace_id = v_doc.workspace_id
  ) then raise exception 'Workspace access denied'; end if;

  select * into v_workspace from public.workspaces where id = v_doc.workspace_id;
  select * into v_blueprint from public.signature_blueprints where id = p_blueprint_id;
  if v_workspace.id is null or v_blueprint.id is null
     or v_workspace.organization_id <> v_doc.organization_id
     or v_blueprint.organization_id <> v_doc.organization_id
     or v_blueprint.document_type is distinct from v_doc.document_type
     or v_blueprint.is_active is distinct from true
     or v_workspace.type not in ('hotel','head_office','head_office_department','sarh')
     or (v_workspace.type = 'hotel' and v_blueprint.scope <> 'hotels')
     or (v_workspace.type <> 'hotel' and v_blueprint.scope <> 'head_office')
  then raise exception 'Workflow unavailable for this document'; end if;

  select coalesce(o.is_enabled,true) into v_enabled
    from public.signature_blueprint_overrides o
    where o.blueprint_id = p_blueprint_id and o.workspace_id = v_doc.workspace_id;
  if v_enabled is false then raise exception 'Workflow disabled for workspace'; end if;
  if not exists (
    select 1 from public.signature_blueprint_steps s
    where s.blueprint_id = p_blueprint_id and s.is_requester
      and s.is_required and s.recipient_type = 'signer'
  ) then raise exception 'Missing mandatory requester'; end if;
  if v_doc.document_type = 'DI' then
    perform public.onosign_required_power_count(
      v_doc.document_type, v_doc.amount_eur, v_blueprint.financial_threshold_eur);
  end if;

  update public.documents set signature_blueprint_id = p_blueprint_id
    where id = p_document_id and status = 'draft'
      and signature_blueprint_id is null;
  if not found then raise exception 'Workflow selection conflict'; end if;
  return p_blueprint_id;
end;
$$;

revoke all on function public.onosign_assign_blueprint(uuid,uuid) from public;
grant execute on function public.onosign_assign_blueprint(uuid,uuid) to authenticated;
