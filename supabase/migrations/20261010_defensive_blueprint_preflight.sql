-- Defensive preflight: rogue conditional recipients and malformed signature fields.
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
  if b.name in ('DR - Payment Request Form - Above 5000 Euros', 'DR - Payment Request Form - Tous montants')
     and d.document_type = 'DR' then
    if d.amount_eur > 20000 and (
      select count(*) from public.onosign_blueprint_recipient_links l
      join public.signature_blueprint_steps st on st.id = l.blueprint_step_id
      join public.recipients r on r.id = l.recipient_id
      where l.document_id = d.id
        and st.role_label ilike 'Director / Directeur%'
        and r.recipient_type = 'signer'
    ) < 2 then
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
$function$
;

