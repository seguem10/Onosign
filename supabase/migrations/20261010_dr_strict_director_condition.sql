-- Add strict greater-than-20k DR step, separate from DI >= threshold.
alter table public.signature_blueprint_steps
  drop constraint if exists signature_blueprint_steps_condition_type_check;
alter table public.signature_blueprint_steps
  add constraint signature_blueprint_steps_condition_type_check
  check (condition_type in ('always','it','above_threshold','above_20k_strict'));
create or replace function public.onosign_validate_blueprint_step_condition()
returns trigger language plpgsql set search_path = '' as $$
declare v_document_type text;
begin
  select document_type into v_document_type
    from public.signature_blueprints where id = new.blueprint_id;
  if v_document_type is null then
    raise exception 'Unknown blueprint';
  end if;
  if new.condition_type = 'above_threshold' and v_document_type <> 'DI' then
    raise exception 'Financial condition is only valid for DI';
  end if;
  if new.condition_type = 'above_20k_strict' and
     (v_document_type <> 'DR' or new.recipient_type <> 'signer'
      or not new.is_required or new.is_requester) then
    raise exception 'Strict 20k condition requires a mandatory DR signer';
  end if;
  return new;
end;
$;

drop trigger if exists onosign_validate_blueprint_step_condition_trigger
  on public.signature_blueprint_steps;
create trigger onosign_validate_blueprint_step_condition_trigger
before insert or update of blueprint_id, condition_type
on public.signature_blueprint_steps
for each row execute function public.onosign_validate_blueprint_step_condition();

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
      or v_condition not in ('always','it','above_threshold','above_20k_strict') then
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
    if v_condition = 'above_20k_strict' and
      (p_document_type <> 'DR' or v_action <> 'signer' or not v_required or v_requester) then
      raise exception 'Strict 20k condition requires a mandatory DR director signer';
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

-- Apply an assigned, active blueprint to a draft in one transaction.
-- Intentionally refuses IT-conditional steps until a trusted IT flag exists.
-- Sending stays blocked by onosign_block_unvalidated_blueprint_dispatch.
create or replace function public.onosign_populate_blueprint_recipients(
  p_document_id uuid
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.documents%rowtype;
  v_blueprint public.signature_blueprints%rowtype;
  v_requester public.recipients%rowtype;
  v_override_id uuid;
  v_enabled boolean;
  v_step record;
  v_name text;
  v_email text;
  v_step_enabled boolean;
  v_order integer := 1;
  v_count integer := 0;
  v_power_count integer := 0;
  v_required_power_count integer := 0;
  v_inserted_recipient uuid;
  v_workspace_type text;
  v_workspace_org uuid;
  v_seen_emails text[] := array[]::text[];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_doc from public.documents where id = p_document_id for update;
  if not found or v_doc.created_by is distinct from auth.uid()
    or v_doc.status is distinct from 'draft'
    or v_doc.signature_blueprint_id is null then
    raise exception 'Draft workflow unavailable';
  end if;
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = v_doc.workspace_id and m.user_id = auth.uid()
  ) then raise exception 'Workspace access denied'; end if;
  select type,organization_id into v_workspace_type,v_workspace_org
    from public.workspaces where id = v_doc.workspace_id;
  select * into v_blueprint from public.signature_blueprints
    where id = v_doc.signature_blueprint_id;
  if not found or v_blueprint.is_active is distinct from true
    or v_blueprint.organization_id is distinct from v_doc.organization_id
    or v_blueprint.document_type is distinct from v_doc.document_type
    or v_workspace_org is distinct from v_doc.organization_id
    or v_workspace_type not in ('hotel','head_office','head_office_department','sarh')
    or (v_workspace_type = 'hotel' and v_blueprint.scope <> 'hotels')
    or (v_workspace_type <> 'hotel' and v_blueprint.scope <> 'head_office')
  then raise exception 'Blueprint unavailable'; end if;

  select id, is_enabled into v_override_id, v_enabled
    from public.signature_blueprint_overrides
    where blueprint_id = v_blueprint.id and workspace_id = v_doc.workspace_id;
  if v_enabled is false then raise exception 'Blueprint disabled for workspace'; end if;

  -- Do not overwrite manually prepared recipients or orphan PDF fields.
  if (select count(*) from public.recipients where document_id = p_document_id) <> 1
    or exists (select 1 from public.signature_fields where document_id = p_document_id)
  then raise exception 'Expected only the requester and no signature fields'; end if;
  select * into v_requester from public.recipients
    where document_id = p_document_id for update;
  if v_requester.recipient_type <> 'signer'
    or v_requester.signing_order <> 1
    or v_requester.name is null or btrim(v_requester.name) = ''
    or v_requester.email is null or btrim(v_requester.email) = ''
  then raise exception 'Invalid requester recipient'; end if;
  if not exists (
    select 1 from public.signature_blueprint_steps
    where blueprint_id = v_blueprint.id and is_requester
      and is_required and step_order = 1 and recipient_type = 'signer'
  ) then raise exception 'Missing first requester step'; end if;

  if v_doc.document_type = 'DI' then
    v_required_power_count := public.onosign_required_power_count(
      v_doc.document_type, v_doc.amount_eur, v_blueprint.financial_threshold_eur
    );
  end if;
  if v_requester.email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Invalid requester email';
  end if;
  v_seen_emails := array[lower(btrim(v_requester.email))];
  for v_step in
    select s.id,s.step_order,s.role_label,s.default_name,s.default_email,
           s.recipient_type,s.is_requester,s.is_required,s.condition_type,s.authorization_role,
           o.default_name as override_name,o.default_email as override_email,
           o.is_enabled as override_enabled
    from public.signature_blueprint_steps s
    left join public.signature_blueprint_step_overrides o
      on o.step_id = s.id and o.blueprint_override_id = v_override_id
    where s.blueprint_id = v_blueprint.id
    order by s.step_order
  loop
    if v_step.is_requester then continue; end if;
    if v_step.is_required and v_step.recipient_type <> 'signer' then
      raise exception 'Required workflow step must sign';
    end if;
    if v_step.condition_type = 'it' then
      raise exception 'IT condition requires a trusted document classification';
    end if;
    if v_step.condition_type = 'above_threshold' then
      if v_doc.document_type <> 'DI' or v_doc.amount_eur is null then
        raise exception 'Invalid conditional DI step';
      end if;
      if v_doc.amount_eur < v_blueprint.financial_threshold_eur then continue; end if;
    end if;
    if v_step.condition_type = 'above_20k_strict' then
      if v_doc.document_type <> 'DR' or v_doc.amount_eur is null then
        raise exception 'Invalid conditional DR step or missing amount';
      end if;
      if v_doc.amount_eur <= 20000 then continue; end if;
    end if;
    v_step_enabled := v_step.is_required or coalesce(v_step.override_enabled,true);
    if not v_step_enabled then continue; end if;
    v_name := coalesce(nullif(btrim(v_step.override_name),''),
                       nullif(btrim(v_step.default_name),''));
    v_email := lower(coalesce(nullif(btrim(v_step.override_email),''),
                              nullif(btrim(v_step.default_email),'')));
    if v_name is null or v_email is null
      or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    then raise exception 'Signer identity incomplete for role %',v_step.role_label; end if;
    if v_email = any(v_seen_emails) then
      raise exception 'Duplicate recipient email in workflow'; end if;
    v_seen_emails := array_append(v_seen_emails,v_email);
    if v_step.authorization_role = 'power_of_attorney' then
      if v_doc.document_type <> 'DI' or v_step.recipient_type <> 'signer' then
        raise exception 'Invalid financial signer';
      end if;
      v_power_count := v_power_count + 1;
    end if;
    v_order := v_order + 1;
    insert into public.recipients
      (document_id,name,email,role_label,recipient_type,signing_order,status)
    values (p_document_id,v_name,v_email,v_step.role_label,
            v_step.recipient_type,v_order,'pending')
    returning id into v_inserted_recipient;
    insert into public.onosign_blueprint_recipient_links
      (recipient_id,document_id,blueprint_step_id,authorization_role)
    values (v_inserted_recipient,p_document_id,v_step.id,v_step.authorization_role);
    v_count := v_count + 1;
  end loop;
  if v_doc.document_type = 'DI' and v_power_count < v_required_power_count then
    raise exception 'Insufficient distinct power-of-attorney signers';
  end if;
  if v_count = 0 then raise exception 'Blueprint has no additional recipients'; end if;
  return v_count;
end;
$$;
revoke all on function public.onosign_populate_blueprint_recipients(uuid) from public;
grant execute on function public.onosign_populate_blueprint_recipients(uuid) to authenticated;
