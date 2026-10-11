-- Read-only delivery pipeline checks. Never claims or sends real jobs.
with checks(name,passed) as (
  select 'claim_service_role_only',
    has_function_privilege('service_role','public.onosign_claim_email_jobs(integer)','EXECUTE')
    and not has_function_privilege('authenticated','public.onosign_claim_email_jobs(integer)','EXECUTE')
    and not has_function_privilege('anon','public.onosign_claim_email_jobs(integer)','EXECUTE')
  union all select 'finish_service_role_only',
    has_function_privilege('service_role','public.onosign_finish_email_job(uuid,text,text,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.onosign_finish_email_job(uuid,text,text,text)','EXECUTE')
  union all select 'recovery_service_role_only',
    has_function_privilege('service_role','public.onosign_requeue_stale_email_jobs(integer)','EXECUTE')
    and not has_function_privilege('authenticated','public.onosign_requeue_stale_email_jobs(integer)','EXECUTE')
    and not has_function_privilege('anon','public.onosign_requeue_stale_email_jobs(integer)','EXECUTE')
  union all select 'delivery_outbox_private',
    (select relrowsecurity from pg_class where oid='public.onosign_email_outbox'::regclass)
    and not has_table_privilege('anon','public.onosign_email_outbox','SELECT')
    and not has_table_privilege('authenticated','public.onosign_email_outbox','SELECT')
  union all select 'no_raw_invitation_tokens',
    not exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='onosign_invitation_secrets'
        and column_name in ('token','raw_token','bearer_token'))
  union all select 'dispatch_still_blocked',
    exists(select 1 from pg_trigger where tgname='onosign_block_unvalidated_blueprint_dispatch_trigger'
      and tgenabled='O' and tgrelid='public.documents'::regclass)
  union all select 'hotel_di_dr_models_inactive',
    (select count(*) from public.signature_blueprints
      where name in ('DI - Circuit central ONOMO - Hôtels',
                     'DR - Payment Request Form - Tous montants')
        and is_active=false)=2
)
select name,case when passed then 'PASS' else 'FAIL' end as result from checks order by name;
