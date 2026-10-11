-- UTC-stable audit hash payload. Existing chains must be empty before upgrading.
do $$ begin
 if exists(select 1 from public.onosign_document_audit) then
   raise exception 'Audit hash version upgrade requires a reviewed backfill';
 end if;
end $$;
create or replace function public.onosign_audit_checksum(
 p public.onosign_document_audit,p_prev text
) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(p_prev||':'||
 jsonb_build_object(
  'id',p.id,'seq',p.chain_sequence,'document',p.document_id,
  'event',p.event_type,'actor',p.actor_id,'recipient',p.recipient_id,
  'before',p.previous_status,'after',p.next_status,
  'pdf_hash',p.source_sha256,'workspace',p.workspace_id,
  'organization',p.organization_id,
  'at_epoch_us',(extract(epoch from p.occurred_at)*1000000)::bigint
 )::text,'UTF8')),'hex')
$$;
revoke execute on function public.onosign_audit_checksum(public.onosign_document_audit,text)
 from public,anon,authenticated;