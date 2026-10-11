-- Rollback-only technical audit chain smoke test; no records persist.
do $$
declare
 v_doc uuid;
 v_event public.onosign_document_audit%rowtype;
 v_before bigint;
 v_ok boolean:=false;
begin
 select id into v_doc from public.documents order by id limit 1;
 if v_doc is null then return; end if;
 select count(*) into v_before from public.onosign_document_audit;
 begin
  insert into public.onosign_document_audit(document_id,event_type,next_status)
  values(v_doc,'document_created','draft') returning * into v_event;
  if v_event.chain_sequence is null
   or length(v_event.previous_hash)<>64
   or v_event.entry_hash is distinct from
     public.onosign_audit_checksum(v_event,v_event.previous_hash)
  then raise exception 'Hash-chain verification failed'; end if;
  v_ok:=true;
  raise exception 'ROLLBACK_AUDIT_TEST_EVENT';
 exception when others then
  if sqlerrm<>'ROLLBACK_AUDIT_TEST_EVENT' then raise; end if;
 end;
 if not v_ok then raise exception 'Audit test did not run'; end if;
 if (select count(*) from public.onosign_document_audit)<>v_before then
  raise exception 'Audit smoke test leaked a record';
 end if;
end;
$$;