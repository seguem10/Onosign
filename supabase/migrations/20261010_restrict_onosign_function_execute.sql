-- Limit OnoSign RPC endpoints to authenticated sessions.
-- All SECURITY DEFINER functions independently validate user/workspace permissions.
-- Trigger functions are not callable as regular RPCs.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'onosign_%'
  loop
    execute format('revoke execute on function %s from public, anon', fn.signature);
    execute format('grant execute on function %s to authenticated', fn.signature);
  end loop;
end $$;
