-- OnoSign: protect per-establishment customizations at the database boundary.
-- Additive integrity checks. This does not activate a model or authorize sending.
-- The checks apply even when a write bypasses the browser UI.

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
  if (v_workspace_type = 'hotel' and v_scope <> 'hotels')
    or (v_workspace_type <> 'hotel' and v_scope <> 'head_office') then
    raise exception 'Blueprint scope does not match workspace type';
  end if;
  return new;
end;
$$;

drop trigger if exists onosign_validate_blueprint_override_trigger
  on public.signature_blueprint_overrides;
create trigger onosign_validate_blueprint_override_trigger
before insert or update of blueprint_id, workspace_id
on public.signature_blueprint_overrides
for each row execute function public.onosign_validate_blueprint_override();

create or replace function public.onosign_validate_blueprint_step_override()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_blueprint_id uuid;
  v_step_blueprint_id uuid;
  v_required boolean;
  v_requester boolean;
begin
  select blueprint_id into v_blueprint_id
  from public.signature_blueprint_overrides where id = new.blueprint_override_id;
  select blueprint_id, is_required, is_requester
  into v_step_blueprint_id, v_required, v_requester
  from public.signature_blueprint_steps where id = new.step_id;

  if v_blueprint_id is null or v_step_blueprint_id is null
    or v_blueprint_id <> v_step_blueprint_id then
    raise exception 'Step must belong to the overridden blueprint';
  end if;
  if new.is_enabled is false and (v_required or v_requester) then
    raise exception 'Required signer cannot be disabled';
  end if;
  if v_requester and (new.default_name is not null or new.default_email is not null) then
    raise exception 'Requester identity must come from the authenticated user';
  end if;
  if new.default_email is not null and (
    length(new.default_email) > 254 or
    new.default_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ) then
    raise exception 'Invalid signer email';
  end if;
  return new;
end;
$$;

drop trigger if exists onosign_validate_blueprint_step_override_trigger
  on public.signature_blueprint_step_overrides;
create trigger onosign_validate_blueprint_step_override_trigger
before insert or update of blueprint_override_id, step_id, default_name, default_email, is_enabled
on public.signature_blueprint_step_overrides
for each row execute function public.onosign_validate_blueprint_step_override();
