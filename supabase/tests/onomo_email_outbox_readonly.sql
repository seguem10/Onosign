-- Release monitoring invariants. Read-only; does not touch envelopes.
with checks(name,passed) as (
 select 'delivery_health_not_anonymous',
   not has_function_privilege('anon','public.onosign_delivery_health()','EXECUTE')
 union all
 select 'delivery_health_auth_only',
   has_function_privilege('authenticated','public.onosign_delivery_health()','EXECUTE')
 union all
 select 'delivery_health_counts_manual_review',
   pg_get_functiondef('public.onosign_delivery_health()'::regprocedure)
     like '%manual_review%'
 union all
 select 'delivery_health_counts_provider_acceptance',
   pg_get_functiondef('public.onosign_delivery_health()'::regprocedure)
     like '%delivered%'
 union all
 select 'email_outbox_private',
   (select relrowsecurity from pg_class where oid='public.onosign_email_outbox'::regclass)
    and not has_table_privilege('anon','public.onosign_email_outbox','SELECT')
    and not has_table_privilege('authenticated','public.onosign_email_outbox','SELECT')
 union all
 select 'invitation_secrets_private',
   (select relrowsecurity from pg_class where oid='public.onosign_invitation_secrets'::regclass)
    and not has_table_privilege('anon','public.onosign_invitation_secrets','SELECT')
    and not has_table_privilege('authenticated','public.onosign_invitation_secrets','SELECT')
 union all
 select 'delivery_worker_rpc_service_only',
   not has_function_privilege('anon','public.onosign_claim_email_jobs(integer)','EXECUTE')
    and not has_function_privilege('authenticated','public.onosign_claim_email_jobs(integer)','EXECUTE')
)
select name,case when passed then 'PASS' else 'FAIL' end as result from checks order by name;