-- Read-only migration verification for audit retention and mail-staging safety.
with tests(name,passed) as (
 select 'audit_events_immutable',
  exists(select 1 from pg_trigger where tgrelid='public.onosign_document_audit'::regclass and tgname='onosign_audit_immutable' and tgenabled='O')
 union all select 'audit_survives_cleanup',
  exists(select 1 from pg_constraint where conrelid='public.onosign_document_audit'::regclass
    and conname='onosign_document_audit_document_id_fkey' and confdeltype='r')
 union all select 'audit_snapshots_digest',
  exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='onosign_document_audit' and column_name='source_sha256')
 union all select 'private_outbound_queue',
  (select relrowsecurity from pg_class where oid='public.onosign_delivery_outbox'::regclass)
  and not has_table_privilege('authenticated','public.onosign_delivery_outbox','INSERT')
  and not has_table_privilege('anon','public.onosign_delivery_outbox','SELECT')
 union all select 'private_invitation_tokens',
  (select relrowsecurity from pg_class where oid='public.onosign_invitation_secrets'::regclass)
  and not has_table_privilege('authenticated','public.onosign_invitation_secrets','SELECT')
 union all select 'queued_signer_guard',
  exists(select 1 from pg_trigger where tgrelid='public.onosign_delivery_outbox'::regclass
    and tgname='onosign_validate_delivery_item_trg' and tgenabled='O')
 union all select 'anon_not_allowed_legacy_functions',
  not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('can_admin_profile','create_organization',
      'handle_new_user','is_organization_owner','is_workspace_admin','is_workspace_member')
      and has_function_privilege('anon',p.oid,'EXECUTE'))
 union all select 'outbox_has_no_pending_items',
  (select count(*) from public.onosign_delivery_outbox)=0
)
select name,case when passed then 'PASS' else 'FAIL' end result
from tests order by name;