-- OnoSign: atomic creation of blueprint and ordered steps.
-- Requires 20261009_signature_blueprints.sql to be applied first.
-- This function does not activate or send a workflow.
create or replace function public.onosign_create_blueprint(
  p_name text,
  p_document_type text,
  p_scope text,
  p_threshold_eur numeric,
  p_steps jsonb
) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid;
  v_id uuid;
  v_step jsonb;
  v_order integer := 0;
  v_requester_count integer := 0;
  v_role text;
  v_name text;
  v_email text;
  v_action text;
  v_condition text;
  v_required boolean;
  v_requester boolean;
  v_authorization_role text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  -- Reject ambiguous memberships: the function is scoped to exactly one admin org.
  select min(m.organization_id) into v_org
  from public.organization_members m
  where m.user_id = v_user and m.role in ('owner', 'admin');
  if v_org is null then raise exception 'Admin membership required'; end if;
  if (select count(distinct m.organization_id) from public.organization_members m
      where m.user_id = v_user and m.role in ('owner', 'admin')) <> 1 then
    raise exception 'Ambiguous organization membership';
  end if;

  if p_name is null or length(trim(p_name)) not between 2 and 160 then
    raise exception 'Invalid model name';
  end if;
  if p_document_type is null or p_scope is null
    or p_document_type not in ('DI','DR') or p_scope not in ('hotels','head_office') then
    raise exception 'Invalid document type or scope';
  end if;
  if (p_document_type = 'DI' and (p_threshold_eur is null or p_threshold_eur <= 0))
    or (p_document_type = 'DR' and p_threshold_eur is not null) then
    raise exception 'Invalid financial threshold';
  end if;
  if p_steps is null or jsonb_typeof(p_steps) <> 'array'
    or jsonb_array_length(p_steps) not between 1 and 30 then
    raise exception 'Expected 1 to 30 workflow steps';
  end if;

  -- No untrusted JSON is persisted before validation.
  for v_step in select value from jsonb_array_elements(p_steps)
  loop
    if jsonb_typeof(v_step) <> 'object' then raise exception 'Invalid step'; end if;
    v_order := v_order + 1;
    v_role := nullif(trim(v_step->>'role'), '');
    v_email := nullif(trim(v_step->>'email'), '');
    v_name := nullif(trim(v_step->>'name'), '');
    v_action := v_step->>'action';
    v_authorization_role := coalesce(v_step->>'authorization_role','none');
    v_condition := v_step->>'condition';
    if jsonb_typeof(v_step->'required') <> 'boolean'
      or jsonb_typeof(v_step->'is_requester') <> 'boolean' then
      raise exception 'Invalid boolean field';
    end if;
    v_required := (v_step->>'required')::boolean;
    v_requester := (v_step->>'is_requester')::boolean;
    if v_role is null or length(v_role) > 120 then raise exception 'Invalid role'; end if;
    if v_name is not null and length(v_name) > 200 then raise exception 'Invalid name'; end if;
    if v_email is not null and (length(v_email) > 254
      or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then
      raise exception 'Invalid email';
    end if;
    if v_action not in ('signer','cc')
      or v_condition not in ('always','it','above_threshold') then
      raise exception 'Invalid recipient action or condition';
    end if;
    if v_authorization_role not in ('none','power_of_attorney') then
      raise exception 'Invalid authorization role';
    end if;
    if v_authorization_role = 'power_of_attorney' and
      (p_document_type <> 'DI' or v_requester or not v_required or v_action <> 'signer'
       or v_condition not in ('always','above_threshold')) then
      raise exception 'Invalid power-of-attorney signer';
    end if;
    if v_condition = 'above_threshold' and p_document_type <> 'DI' then
      raise exception 'Threshold conditions require DI';
    end if;
    if v_order = 1 and not v_requester then
      raise exception 'First step must be requester';
    end if;
    if v_requester and (v_name is not null or v_email is not null) then
      raise exception 'Requester identity must not be configured in a template';
    end if;
    if v_requester then
      v_requester_count := v_requester_count + 1;
      if v_order <> 1 or not v_required or v_action <> 'signer'
        or v_condition <> 'always' then
        raise exception 'Requester must be first, required signer';
      end if;
    end if;
  end loop;
  if v_requester_count <> 1 then raise exception 'Exactly one requester required'; end if;

  insert into public.signature_blueprints
    (organization_id, name, document_type, scope, financial_threshold_eur, created_by, is_active)
  values (v_org, trim(p_name), p_document_type, p_scope, p_threshold_eur, v_user, false)
  returning id into v_id;

  v_order := 0;
  for v_step in select value from jsonb_array_elements(p_steps)
  loop
    v_order := v_order + 1;
    insert into public.signature_blueprint_steps
      (blueprint_id, step_order, role_label, default_name, default_email,
       recipient_type, is_requester, is_required, condition_type, authorization_role)
    values (
      v_id, v_order, trim(v_step->>'role'),
      nullif(trim(coalesce(v_step->>'name','')), ''),
      nullif(trim(coalesce(v_step->>'email','')), ''),
      v_step->>'action', (v_step->>'is_requester')::boolean,
      (v_step->>'required')::boolean, v_step->>'condition',
      coalesce(v_step->>'authorization_role','none')
    );
  end loop;
  return v_id;
end;
$$;

revoke all on function public.onosign_create_blueprint(text,text,text,numeric,jsonb) from public;
grant execute on function public.onosign_create_blueprint(text,text,text,numeric,jsonb) to authenticated;
