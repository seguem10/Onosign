-- Non-mutating release checks for archive isolation and read controls.
with checks(name,passed) as (
  select 'final_bucket_private',
    exists (select 1 from storage.buckets where id='onosign-final-pdfs'
      and public=false and file_size_limit=20971520
      and allowed_mime_types=array['application/pdf']::text[])
  union all select 'archive_registry_rls',
    (select relrowsecurity from pg_class where oid='public.onosign_final_artifacts'::regclass)
  union all select 'no_anonymous_archive_table',
    not has_table_privilege('anon','public.onosign_final_artifacts','SELECT')
    and not has_table_privilege('anon','public.onosign_final_artifacts','INSERT')
  union all select 'no_authenticated_archive_table',
    not has_table_privilege('authenticated','public.onosign_final_artifacts','SELECT')
    and not has_table_privilege('authenticated','public.onosign_final_artifacts','INSERT')
    and not has_table_privilege('authenticated','public.onosign_final_artifacts','DELETE')
  union all select 'guard_archive_write',
    exists (select 1 from pg_trigger where tgname='onosign_final_artifact_guard_trigger'
      and tgrelid='public.onosign_final_artifacts'::regclass and tgenabled='O')
  union all select 'archive_document_link_restrict_delete',
    exists (select 1 from pg_constraint
      where conrelid='public.onosign_final_artifacts'::regclass
        and confrelid='public.documents'::regclass
        and confdeltype='r')
  union all select 'no_anonymous_archive_rpc',
    not has_function_privilege('anon','public.onosign_final_artifact_info(uuid)','EXECUTE')
    and not has_function_privilege('anon','public.onosign_can_read_archived_pdf(text)','EXECUTE')
  union all select 'authenticated_archive_rpc',
    has_function_privilege('authenticated','public.onosign_final_artifact_info(uuid)','EXECUTE')
  union all select 'archive_storage_policy',
    exists (select 1 from pg_policies where schemaname='storage'
      and tablename='objects' and policyname='onosign_read_completed_final_pdf'
      and cmd='SELECT')
  union all select 'no_client_archive_upload_policy',
    not exists (select 1 from pg_policies where schemaname='storage'
      and tablename='objects' and cmd='INSERT'
      and (with_check like '%onosign-final-pdfs%'))
  union all select 'no_client_archive_mutation_policy',
    not exists (select 1 from pg_policies where schemaname='storage'
      and tablename='objects' and cmd in ('UPDATE','DELETE')
      and (coalesce(qual,'') like '%onosign-final-pdfs%'
        or coalesce(with_check,'') like '%onosign-final-pdfs%'))
  union all select 'dispatch_guard_still_enabled',
    exists (select 1 from pg_trigger where tgrelid='public.documents'::regclass
      and tgname='onosign_block_unvalidated_blueprint_dispatch_trigger'
      and tgenabled='O')
  union all select 'hotel_models_remain_inactive',
    (select count(*) from public.signature_blueprints
      where name in ('DI - Circuit central ONOMO - Hôtels',
                     'DR - Payment Request Form - Tous montants')
        and is_active=false)=2
) select name, case when passed then 'PASS' else 'FAIL' end as result
from checks order by name;
