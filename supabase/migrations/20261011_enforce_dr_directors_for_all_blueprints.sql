-- Validate RAF and two directors on every activated DR blueprint.
-- Scope and creator checks in the existing functions are preserved.
create or replace function public.onosign_validate_blueprint_activation()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_always integer;
  v_above integer;
  v_finance integer;
begin
  if new.is_active then
    if not exists (
      select 1 from public.signature_blueprint_steps s where s.blueprint_id=new.id
        and s.is_requester and s.is_required and s.step_order=1
        and s.recipient_type='signer'
    ) then raise exception 'First requester signature is mandatory'; end if;
    if new.document_type='DI' then
      select count(*) filter(where condition_type='always'),
             count(*) filter(where condition_type='above_threshold')
      into v_always,v_above from public.signature_blueprint_steps
      where blueprint_id=new.id and authorization_role='power_of_attorney'
        and is_required and recipient_type='signer' and not is_requester;
      if v_always<1 or v_always+v_above<2 then
        raise exception 'DI requires one permanent and two total power-of-attorney signer slots';
      end if;
    elsif new.document_type='DR' then
      select count(*) filter(where s.role_label ilike 'Director / Directeur%'
                               and s.condition_type='always'),
             count(*) filter(where s.role_label ilike 'Director / Directeur%'
                               and s.condition_type='above_20k_strict'),
             count(*) filter(where (s.role_label ilike 'Financial Department%'
                                  or s.role_label ilike 'RAF%')
                               and s.condition_type='always')
      into v_always,v_above,v_finance
      from public.signature_blueprint_steps s where s.blueprint_id=new.id
        and s.is_required and s.recipient_type='signer' and not s.is_requester;
      if v_always<1 or v_above<1 or v_finance<1 then
        raise exception 'DR requires finance, one permanent director and a second director strictly above EUR 20000';
      end if;
    end if;
  end if;
  return new;
end;
$$;
CREATE OR REPLACE FUNCTION public.onosign_populate_blueprint_recipients(p_document_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_dr_director_count integer := 0;
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
    if v_doc.document_type = 'DR'
       
       and v_step.role_label ilike 'Director / Directeur%'
       and v_step.recipient_type = 'signer' then
      v_dr_director_count := v_dr_director_count + 1;
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
  if v_doc.document_type = 'DR'
     
     and v_dr_director_count < (case when v_doc.amount_eur > 20000 then 2 else 1 end)
  then raise exception 'Missing required director signatures for payment request'; end if;
  if v_count = 0 then raise exception 'Blueprint has no additional recipients'; end if;
  return v_count;
end;
$function$;
CREATE OR REPLACE FUNCTION public.onosign_blueprint_preflight(p_document_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  d public.documents%rowtype;
  b public.signature_blueprints%rowtype;
  v_total int;
  v_linked int;
  v_power int;
  v_required int := 0;
  v_signers_without_fields int;
  v_errors text[] := array[]::text[];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into d from public.documents where id = p_document_id;
  if not found or d.created_by is distinct from auth.uid() then
    raise exception 'Document unavailable';
  end if;
  if not exists (select 1 from public.workspace_members m
                 where m.workspace_id = d.workspace_id and m.user_id = auth.uid()) then
    raise exception 'Workspace access denied';
  end if;
  if d.signature_blueprint_id is null then
    raise exception 'Document has no catalogue workflow';
  end if;
  select * into b from public.signature_blueprints where id = d.signature_blueprint_id;
  if d.status <> 'draft' then v_errors := array_append(v_errors,'not_draft'); end if;
  if b.id is null or not b.is_active then
    v_errors := array_append(v_errors,'blueprint_inactive');
  end if;
  select count(*) into v_total from public.recipients where document_id = d.id;
  select count(*) into v_linked from public.onosign_blueprint_recipient_links
    where document_id = d.id;
  if v_total < 2 or v_total <> v_linked + 1 then
    v_errors := array_append(v_errors,'recipient_mapping_incomplete');
  end if;
  if exists (
    select 1 from public.recipients r where r.document_id = d.id
      and (r.status <> 'pending' or r.signed_at is not null)
  ) then v_errors := array_append(v_errors,'recipient_already_processed'); end if;
  if exists (
    select 1 from public.recipients r where r.document_id = d.id
    group by lower(btrim(r.email)) having count(*) > 1
  ) then v_errors := array_append(v_errors,'duplicate_recipient_email'); end if;
  select count(*) into v_signers_without_fields
  from public.recipients r
  where r.document_id = d.id and r.recipient_type = 'signer'
    and not exists (
      select 1 from public.signature_fields f
      where f.document_id = d.id and f.recipient_id = r.id
        and f.field_type = 'signature'
    );
  if v_signers_without_fields > 0 then
    v_errors := array_append(v_errors,'missing_signature_fields');
  end if;
  if d.document_type = 'DI' and b.id is not null then
    v_required := public.onosign_required_power_count(
      d.document_type,d.amount_eur,b.financial_threshold_eur);
    select count(*) into v_power
    from public.onosign_blueprint_recipient_links l
    join public.recipients r on r.id = l.recipient_id
    where l.document_id = d.id and l.authorization_role = 'power_of_attorney'
      and r.recipient_type = 'signer';
    if v_power < v_required then
      v_errors := array_append(v_errors,'insufficient_power_of_attorney');
    end if;
  else v_power := 0; end if;
  -- DR applies to every amount. The second director is required strictly above 20k.
  if d.document_type = 'DR' then
    if (
      select count(*) from public.onosign_blueprint_recipient_links l
      join public.signature_blueprint_steps st on st.id = l.blueprint_step_id
      join public.recipients r on r.id = l.recipient_id
      where l.document_id = d.id
        and st.role_label ilike 'Director / Directeur%'
        and r.recipient_type = 'signer'
    ) < (case when d.amount_eur > 20000 then 2 else 1 end) then
      v_errors := array_append(v_errors,'payment_request_second_director_required');
    end if;
  end if;
  if d.document_type in ('DI','DR') and (d.amount_eur is null or d.amount_eur < 0) then
    v_errors := array_append(v_errors,'missing_or_invalid_amount');
  end if;
  if exists (select 1 from public.onosign_blueprint_recipient_links l
     join public.recipients r on r.id=l.recipient_id
     join public.signature_blueprint_steps s on s.id=l.blueprint_step_id
     where l.document_id=d.id and (r.document_id<>d.id or s.blueprint_id<>b.id
       or r.recipient_type<>s.recipient_type or r.role_label is distinct from s.role_label
       or l.authorization_role is distinct from s.authorization_role)) then
    v_errors := array_append(v_errors,'recipient_step_mismatch');
  end if;
  -- Reject a mapped recipient whose financial condition does not apply.
  if exists (
    select 1 from public.onosign_blueprint_recipient_links l
    join public.signature_blueprint_steps s on s.id=l.blueprint_step_id
    where l.document_id=d.id and (
      s.is_requester or s.condition_type='it'
      or (s.condition_type='above_threshold' and
          (d.document_type is distinct from 'DI' or d.amount_eur is null
           or d.amount_eur < b.financial_threshold_eur))
      or (s.condition_type='above_20k_strict' and
          (d.document_type is distinct from 'DR' or d.amount_eur is null
           or d.amount_eur <= 20000))
    )
  ) then v_errors := array_append(v_errors,'unexpected_workflow_step'); end if;
  -- All non-mapped recipients must be the single requester, in position 1.
  if (select count(*) from public.recipients r
      left join public.onosign_blueprint_recipient_links l on l.recipient_id=r.id
      where r.document_id=d.id and l.recipient_id is null and
        r.recipient_type='signer' and r.signing_order=1) <> 1
  then v_errors := array_append(v_errors,'requester_mapping_invalid'); end if;
  if exists (
    select 1 from public.recipients r where r.document_id=d.id
    group by r.signing_order having count(*) > 1
  ) then v_errors := array_append(v_errors,'duplicate_signing_order'); end if;
  if exists (
    select 1 from public.signature_fields f
    where f.document_id=d.id and
      (f.page_number<1 or f.x<0 or f.y<0 or f.width<=0 or f.height<=0
       or f.x+f.width>1 or f.y+f.height>1
       or not exists (select 1 from public.recipients r
        where r.id=f.recipient_id and r.document_id=d.id and r.recipient_type='signer'))
  ) then v_errors := array_append(v_errors,'invalid_signature_field'); end if;
  if exists (select 1 from public.signature_blueprint_steps s
    where s.blueprint_id=b.id and s.is_required and not s.is_requester
      and (s.condition_type='always'
        or (s.condition_type='above_threshold' and d.document_type='DI' and d.amount_eur>=b.financial_threshold_eur)
        or (s.condition_type='above_20k_strict' and d.document_type='DR' and d.amount_eur>20000))
      and not exists (select 1 from public.onosign_blueprint_recipient_links l where l.document_id=d.id and l.blueprint_step_id=s.id)) then
    v_errors := array_append(v_errors,'missing_required_workflow_step');
  end if;
  if (select count(*) from public.recipients r where r.document_id=d.id and r.signing_order=1 and r.recipient_type='signer') <> 1 then
    v_errors := array_append(v_errors,'invalid_requester_order');
  end if;
  return jsonb_build_object(
    'ready_for_review',cardinality(v_errors) = 0,
    'dispatch_authorized',false,
    'issues',to_jsonb(v_errors),
    'recipients',v_total,
    'mapped_recipients',v_linked,
    'required_power_signers',v_required,
    'actual_power_signers',v_power,
    'signers_missing_signature_fields',v_signers_without_fields
  );
end;
$function$;
