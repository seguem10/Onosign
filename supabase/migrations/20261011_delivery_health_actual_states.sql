-- Align health monitoring with actual OnoSign outbox states:
-- queued, retry, sending, delivered, manual_review.
CREATE OR REPLACE FUNCTION public.onosign_delivery_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    count(*) filter(where o.status in ('queued','retry','sending'))::integer,
    count(*) filter(where o.status in ('manual_review'))::integer,
    count(*) filter(where o.status='delivered')::integer
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
$function$;
revoke execute on function public.onosign_delivery_health() from public, anon;
grant execute on function public.onosign_delivery_health() to authenticated;