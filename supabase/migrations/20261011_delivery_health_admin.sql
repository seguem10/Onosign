-- Aggregated operational email queue metrics. Never returns recipients, tokens, or addresses.
create or replace function public.onosign_delivery_health()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
  v_pending integer;
  v_failed integer;
  v_sent integer;
begin
  if auth.uid() is null then
    raise exception 'Administration required';
  end if;
  select om.organization_id into v_org
  from public.organization_members om
  where om.user_id=auth.uid() and om.role in ('owner','admin')
  order by om.organization_id limit 1;
  if v_org is null then raise exception 'Administration required'; end if;
  select
    count(*) filter(where o.status in ('pending','queued','retry'))::integer,
    count(*) filter(where o.status in ('failed','dead'))::integer,
    count(*) filter(where o.status='sent')::integer
  into v_pending,v_failed,v_sent
  from public.onosign_email_outbox o
  join public.documents d on d.id=o.document_id
  where d.organization_id=v_org;
  return jsonb_build_object(
    'pending', coalesce(v_pending,0),
    'failed', coalesce(v_failed,0),
    'sent', coalesce(v_sent,0),
    'delivery_enabled', false,
    'verified_at', now()
  );
end;
$$;
revoke execute on function public.onosign_delivery_health() from public,anon;
grant execute on function public.onosign_delivery_health() to authenticated;