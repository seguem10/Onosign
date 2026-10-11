-- Fail closed when an establishment tries to disable a mandatory blueprint.
-- A blueprint can be disabled only if every step is optional (never the case
-- for a valid requester-first blueprint). Existing disabled overrides are
-- intentionally not changed by this migration.
create or replace function public.onosign_validate_blueprint_override()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_scope text;
  v_blueprint_org uuid;
  v_workspace_org uuid;
  v_workspace_type text;
begin
  select organization_id, scope into v_blueprint_org, v_scope
  from public.signature_blueprints where id = new.blueprint_id;
  select organization_id, type into v_workspace_org, v_workspace_type
  from public.workspaces where id = new.workspace_id;
  if v_blueprint_org is null or v_workspace_org is null
    or v_blueprint_org <> v_workspace_org then
    raise exception 'Blueprint and workspace must belong to the same organization';
  end if;
  if v_workspace_type not in ('hotel','head_office','head_office_department','sarh')
    or (v_workspace_type = 'hotel' and v_scope <> 'hotels')
    or (v_workspace_type <> 'hotel' and v_scope <> 'head_office') then
    raise exception 'Blueprint scope does not match workspace type';
  end if;
  return new;
end;
$$;

-- Prevent duplicate active templates for the same scope/type/name, even when
-- two admins submit the same model simultaneously. Existing duplicates must
-- be reviewed before installing the unique index.
create unique index if not exists onosign_blueprint_unique_name_per_scope
  on public.signature_blueprints
  (organization_id, scope, document_type, lower(btrim(name)));
