-- Backend-only queue claimant and delivery result recorder. Not enabled by default.
CREATE OR REPLACE FUNCTION public.onosign_claim_email_jobs(p_limit integer DEFAULT 5)
 RETURNS TABLE(job_id uuid, document_id uuid, recipient_email text, recipient_name text, document_title text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_limit<1 or p_limit>10 then
    raise exception 'Invalid batch size';
  end if;
  return query
    with selected as (
      select o.id
      from public.onosign_email_outbox o
      join public.documents d on d.id=o.document_id
      join public.recipients r on r.id=o.recipient_id and r.document_id=d.id
      where o.status in ('queued','retry')
        and o.next_attempt_at<=now()
        and o.attempts<3
        and o.created_at>now()-interval '20 hours'
        and o.event_type='signature_invitation'
        and d.signature_blueprint_id is not null
        and d.status in ('sent','viewed','partially_signed')
        and (d.expires_at is null or d.expires_at>now())
        and r.recipient_type='signer'
        and r.status in ('sent','viewed')
        and lower(btrim(r.email))=o.recipient_email
      order by o.created_at
      for update of o skip locked
      limit p_limit
    ), updated as (
      update public.onosign_email_outbox o
      set status='sending', attempts=o.attempts+1,
          locked_until=now()+interval '5 minutes'
      from selected s where o.id=s.id
      returning o.id,o.document_id,o.recipient_email,o.recipient_name,o.document_title
    )
    select x.id,x.document_id,x.recipient_email,x.recipient_name,x.document_title
    from updated x;
end;
$function$;
revoke execute on function public.onosign_claim_email_jobs(integer) from public,anon,authenticated;
grant execute on function public.onosign_claim_email_jobs(integer) to service_role;
CREATE OR REPLACE FUNCTION public.onosign_finish_email_job(p_job_id uuid, p_status text, p_provider_email_id text DEFAULT NULL::text, p_error text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_next text;
begin
  if p_status not in ('delivered','retry','manual_review') then
    raise exception 'Invalid delivery outcome';
  end if;
  update public.onosign_email_outbox o
  set status=case
        when p_status='retry'
             and o.attempts<3
             and o.created_at>now()-interval '20 hours' then 'retry'
        when p_status='retry' then 'manual_review'
        else p_status end,
      next_attempt_at=case when p_status='retry'
        then now()+make_interval(mins=>least(o.attempts*5,30))
        else o.next_attempt_at end,
      locked_until=null,
      sent_at=case when p_status='delivered' then now() else null end,
      provider_email_id=case when p_status='delivered' then left(p_provider_email_id,120) else o.provider_email_id end,
      last_error=case when p_status='delivered' then null else left(coalesce(p_error,'delivery pending'),200) end
  where o.id=p_job_id and o.status='sending';
  return found;
end;
$function$;
revoke execute on function public.onosign_finish_email_job(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.onosign_finish_email_job(uuid,text,text,text) to service_role;
