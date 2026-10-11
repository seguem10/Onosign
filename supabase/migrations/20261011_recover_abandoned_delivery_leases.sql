-- Recover abandoned leases with capped attempts and short provider
-- idempotency window. No e-mail is sent by this function.
create or replace function public.onosign_requeue_stale_email_jobs(p_limit integer default 10)
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  if p_limit<1 or p_limit>20 then
    raise exception 'Invalid recovery batch size';
  end if;

  with overdue as (
    select o.id
    from public.onosign_email_outbox o
    where o.status='sending' and o.locked_until<now()
    order by o.locked_until
    for update skip locked
    limit p_limit
  ), updated as (
    update public.onosign_email_outbox o
    set status=case when o.attempts>=3
        or o.created_at<=now()-interval '20 hours'
        then 'manual_review' else 'retry' end,
        next_attempt_at=now()+interval '5 minutes',
        locked_until=null,
        last_error='worker_lease_expired'
    from overdue q where o.id=q.id
    returning o.id
  )
  select count(*)::integer into v_count from updated;

  return coalesce(v_count,0);
end;
$$;
revoke execute on function public.onosign_requeue_stale_email_jobs(integer)
from public,anon,authenticated;
grant execute on function public.onosign_requeue_stale_email_jobs(integer) to service_role;
