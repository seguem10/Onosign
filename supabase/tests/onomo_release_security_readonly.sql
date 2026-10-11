-- Read-only deployment security invariants; safe against real documents.
with checks(name, passed) as (
  select 'di_dr_amount_constraint',
    exists (select 1 from pg_constraint where conrelid='public.documents'::regclass
      and conname='onosign_di_dr_amount_required' and convalidated)
    and not exists (select 1 from pg_constraint where conrelid='public.documents'::regclass
      and conname='onosign_amount_only_di')
  union all
  select 'immutable_original_pdf_trigger',
    exists (select 1 from pg_trigger where tgrelid='public.documents'::regclass
      and tgname='onosign_protect_original_artifact_trg' and tgenabled='O')
  union all
  select 'normalized_signature_fields',
    exists (select 1 from pg_constraint where conrelid='public.signature_fields'::regclass
      and conname='onosign_signature_field_normalized_coordinates' and convalidated)
  union all
  select 'signature_field_write_guard',
    exists (select 1 from pg_trigger where tgrelid='public.signature_fields'::regclass
      and tgname='onosign_validate_signature_field_write_trg' and tgenabled='O')
  union all
  select 'private_di_dr_metadata',
    (select count(*) from pg_policies where schemaname='public'
      and permissive='RESTRICTIVE'
      and policyname in ('onosign_private_catalogue_documents',
                         'onosign_private_catalogue_recipients',
                         'onosign_private_catalogue_fields'))=3
  union all
  select 'no_client_pdf_overwrite',
    not exists (select 1 from pg_policies where schemaname='storage'
      and tablename='objects' and cmd='UPDATE')
  union all
  select 'private_limited_pdf_bucket',
    exists (select 1 from storage.buckets where id='documents'
      and public=false and file_size_limit=20971520
      and allowed_mime_types=array['application/pdf']::text[])
  union all
  select 'dispatch_guard_enabled',
    exists (select 1 from pg_trigger where tgrelid='public.documents'::regclass
      and tgname='onosign_block_unvalidated_blueprint_dispatch_trigger'
      and tgenabled='O')
  union all
  select 'no_anonymous_onosign_rpc',
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'onosign_%'
      and has_function_privilege('anon',p.oid,'EXECUTE'))
  union all
  select 'seeded_hotel_models_not_live',
    (select count(*) from public.signature_blueprints where name in (
      'DI - Circuit central ONOMO - Hôtels','DR - Payment Request Form - Tous montants'
    ) and is_active=false)=2
)
select name, case when passed then 'PASS' else 'FAIL' end as result
from checks order by name;
