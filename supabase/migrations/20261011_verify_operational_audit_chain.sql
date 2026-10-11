-- Read-only verifier for creator-owned, tenant-scoped technical audit chains.
create or replace function public.onosign_verify_document_audit(p_document_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 v_prev text := repeat('0',64);
 v_index bigint := 0;
 v_valid boolean := true;
 v_item public.onosign_document_audit%rowtype;
begin
 if (select auth.uid()) is null or not exists (
   select 1 from public.documents d
   join public.workspace_members wm on wm.workspace_id=d.workspace_id
   where d.id=p_document_id and d.created_by=(select auth.uid())
    and wm.user_id=(select auth.uid())
 ) then raise exception 'Audit verification unavailable'; end if;
 for v_item in
   select * from public.onosign_document_audit
   where document_id=p_document_id order by chain_sequence
 loop
   v_index := v_index+1;
   if v_item.chain_sequence is distinct from v_index
     or v_item.previous_hash is distinct from v_prev
     or v_item.entry_hash is distinct from
       public.onosign_audit_checksum(v_item,v_item.previous_hash)
   then
     v_valid := false;
   end if;
   v_prev := v_item.entry_hash;
 end loop;
 return jsonb_build_object(
   'event_count',v_index,
   'chain_valid',v_valid and v_index>0,
   'last_hash',case when v_index>0 then v_prev else null end,
   'attestation_type','untrusted_technical_hash_chain'
 );
end;
$$;
revoke execute on function public.onosign_verify_document_audit(uuid)
 from public,anon;
grant execute on function public.onosign_verify_document_audit(uuid)
 to authenticated;
