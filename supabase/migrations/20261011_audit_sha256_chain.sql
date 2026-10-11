-- Append-only hash-linked operational events (not legal e-signature evidence).
do $$ begin
 if exists(select 1 from public.onosign_document_audit) then
   raise exception 'A controlled audit-chain backfill is required for existing events';
 end if;
end $$;
alter table public.onosign_document_audit
 add column if not exists chain_sequence bigint,
 add column if not exists previous_hash text,
 add column if not exists entry_hash text;
create or replace function public.onosign_audit_checksum(
 p public.onosign_document_audit, p_prev text)
returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(p_prev || ':' ||
 jsonb_build_object(
  'id',p.id,'seq',p.chain_sequence,'document',p.document_id,
  'event',p.event_type,'actor',p.actor_id,'recipient',p.recipient_id,
  'before',p.previous_status,'after',p.next_status,
  'pdf_hash',p.source_sha256,'workspace',p.workspace_id,
  'organization',p.organization_id,'at',p.occurred_at
 )::text,'UTF8')),'hex')
$$;
revoke execute on function public.onosign_audit_checksum(public.onosign_document_audit,text)
 from public,anon,authenticated;
create or replace function public.onosign_chain_audit_insert()
returns trigger language plpgsql set search_path='' as $$
declare v_seq bigint; v_hash text;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.document_id::text,172019));
 select a.chain_sequence,a.entry_hash into v_seq,v_hash
 from public.onosign_document_audit a where a.document_id=new.document_id
 order by a.chain_sequence desc limit 1;
 new.chain_sequence:=coalesce(v_seq,0)+1;
 new.previous_hash:=coalesce(v_hash,repeat('0',64));
 new.entry_hash:=public.onosign_audit_checksum(new,new.previous_hash);
 return new;
end;
$$;
revoke execute on function public.onosign_chain_audit_insert()
 from public,anon,authenticated;
create trigger onosign_chain_audit_insert_trg
 before insert on public.onosign_document_audit
 for each row execute function public.onosign_chain_audit_insert();
alter table public.onosign_document_audit
 alter column chain_sequence set not null,
 alter column previous_hash set not null,
 alter column entry_hash set not null;
alter table public.onosign_document_audit
 add constraint onosign_chain_sequence_positive check(chain_sequence>0);
alter table public.onosign_document_audit
 add constraint onosign_chain_hash_shapes
 check(previous_hash ~ '^[a-f0-9]{64}$' and entry_hash ~ '^[a-f0-9]{64}$');
create unique index onosign_audit_document_sequence_unique
 on public.onosign_document_audit(document_id,chain_sequence);
