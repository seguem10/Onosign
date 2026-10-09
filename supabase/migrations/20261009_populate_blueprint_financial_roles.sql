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
