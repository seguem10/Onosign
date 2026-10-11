-- Read-only checks: signer consent must precede a final archived PDF.
with checks(name,passed) as (
  select 'consents_rsl_enabled',
    (select relrowsecurity from pg_class where oid='public.onosign_signature_consents'::regclass)
  union all select 'consents_not_client_writable',
    not has_table_privilege('anon','public.onosign_signature_consents','INSERT')
    and not has_table_privilege('authenticated','public.onosign_signature_consents','INSERT')
  union all select 'consents_not_client_readable',
    not has_table_privilege('authenticated','public.onosign_signature_consents','SELECT')
  union all select 'immutable_verified_consent_guard',
    exists(select 1 from pg_trigger where tgname='onosign_guard_signature_consent_trg'
      and tgenabled='O' and tgrelid='public.onosign_signature_consents'::regclass)
  union all select 'final_pdf_needs_complete_consents',
    pg_get_functiondef('public.onosign_final_artifact_guard()'::regprocedure)
      like '%v_consents<>v_signers%'
  union all select 'final_pdf_needs_distinct_accounts',
    pg_get_functiondef('public.onosign_final_artifact_guard()'::regprocedure)
      like '%v_actors<>v_signers%'
  union all select 'final_pdf_needs_signed_status',
    pg_get_functiondef('public.onosign_final_artifact_guard()'::regprocedure)
      like '%r.status<>''signed''%'
  union all select 'sending_still_locked',
    exists(select 1 from pg_trigger where tgname='onosign_block_unvalidated_blueprint_dispatch_trigger'
      and tgenabled='O' and tgrelid='public.documents'::regclass)
)
select name,case when passed then 'PASS' else 'FAIL' end as result
from checks order by name;
