-- OnoSign signing foundations: read-only security invariants.
with checks(name,passed) as (
 select 'hash_chain_insert_trigger',exists(select 1 from pg_trigger
   where tgrelid='public.onosign_document_audit'::regclass
     and tgname='onosign_chain_audit_insert_trg' and tgenabled='O')
 union all
 select 'audit_deletion_restricted',exists(select 1 from pg_constraint
   where conrelid='public.onosign_document_audit'::regclass
   and conname='onosign_document_audit_document_id_fkey'
   and pg_get_constraintdef(oid) like '%ON DELETE RESTRICT%')
 union all
 select 'audit_immutable',exists(select 1 from pg_trigger
   where tgrelid='public.onosign_document_audit'::regclass
   and tgname='onosign_audit_immutable' and tgenabled='O')
 union all
 select 'audit_chain_checker_authenticated_only',
  has_function_privilege('authenticated','public.onosign_verify_document_audit(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.onosign_verify_document_audit(uuid)','EXECUTE')
 union all
 select 'audit_hash_function',
  length(public.onosign_audit_checksum(null::public.onosign_document_audit,repeat('0',64)))=64
 union all
 select 'verified_signer_pdf_storage_rls',exists(select 1 from pg_policies
   where schemaname='storage' and tablename='objects'
   and policyname='onosign_confirmed_recipient_can_read_sent_pdf'
   and cmd='SELECT' and roles='{authenticated}')
 union all
 select 'pdf_lookup_not_anonymous',
   not has_function_privilege('anon','public.onosign_signer_pdf_info(uuid)','EXECUTE')
 union all
 select 'outbox_private',
   (select relrowsecurity from pg_class where oid='public.onosign_email_outbox'::regclass)
   and not has_table_privilege('authenticated','public.onosign_email_outbox','SELECT')
   and not has_table_privilege('anon','public.onosign_email_outbox','SELECT')
 union all
 select 'outbox_worker_service_only',
   has_function_privilege('service_role','public.onosign_claim_email_jobs(integer)','EXECUTE')
   and not has_function_privilege('authenticated','public.onosign_claim_email_jobs(integer)','EXECUTE')
   and not has_function_privilege('anon','public.onosign_claim_email_jobs(integer)','EXECUTE')
 union all
 select 'outbox_finish_service_only',
   has_function_privilege('service_role','public.onosign_finish_email_job(uuid,text,text,text)','EXECUTE')
   and not has_function_privilege('authenticated','public.onosign_finish_email_job(uuid,text,text,text)','EXECUTE')
 union all
 select 'mail_trigger_enabled',exists(select 1 from pg_trigger
   where tgrelid='public.recipients'::regclass
    and tgname='onosign_enqueue_email_invitation_trg' and tgenabled='O')
 union all
 select 'catalogue_remains_disabled',
   not exists(select 1 from public.signature_blueprints where is_active)
   and not exists(select 1 from public.documents
      where signature_blueprint_id is not null and status<>'draft')
 union all
 select 'no_email_jobs_pending',
   not exists(select 1 from public.onosign_email_outbox)
)
select name,case when passed then 'PASS' else 'FAIL' end as result
from checks order by name;
