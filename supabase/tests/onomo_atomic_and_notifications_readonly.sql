-- OnoSign read-only rollout checks for atomic DI/DR creation and in-app notifications.
-- This query does not create users or modify documents.
with checks(name,passed) as (
 select 'draft_rpc_restricted_to_authenticated',
  has_function_privilege('authenticated','public.onosign_create_document_draft(uuid,uuid,text,text,text,numeric,text)','EXECUTE')
  and not has_function_privilege('anon','public.onosign_create_document_draft(uuid,uuid,text,text,text,numeric,text)','EXECUTE')
 union all
 select 'direct_di_dr_insert_restricted',
  exists (select 1 from pg_policies where schemaname='public' and tablename='documents'
    and policyname='onosign_di_dr_rpc_only_insert' and permissive='RESTRICTIVE')
 union all
 select 'requester_locked',
  exists (select 1 from pg_trigger where tgrelid='public.recipients'::regclass
    and tgname='onosign_lock_catalogue_requester_trg' and tgenabled='O')
 union all
 select 'first_signer_unique',
  exists (select 1 from pg_indexes where schemaname='public' and tablename='recipients'
    and indexname='onosign_one_requester_position')
 union all
 select 'notifications_private',
  (select relrowsecurity from pg_class where oid='public.onosign_notifications'::regclass)
  and not has_table_privilege('anon','public.onosign_notifications','SELECT')
  and not has_table_privilege('authenticated','public.onosign_notifications','INSERT')
 union all
 select 'notification_triggers_active',
  (select count(*) from pg_trigger where tgenabled='O'
    and tgname in ('onosign_notify_document_created_trg','onosign_notify_signer_ready_trg'))=2
 union all
 select 'task_inbox_not_anonymous',
  not has_function_privilege('anon','public.onosign_my_signature_tasks()','EXECUTE')
)
select name,case when passed then 'PASS' else 'FAIL' end as result
from checks order by name;
