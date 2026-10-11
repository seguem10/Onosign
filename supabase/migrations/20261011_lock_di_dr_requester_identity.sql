-- Make the first signer unique and immutable for DI/DR documents.
create unique index if not exists onosign_one_requester_position
on public.recipients(document_id)
where signing_order=1 and recipient_type='signer';

create or replace function public.onosign_lock_catalogue_requester()
returns trigger language plpgsql set search_path = '' as $$
declare t text;
begin
 select document_type into t from public.documents where id=old.document_id;
 if t in ('DI','DR') and old.signing_order=1 and old.recipient_type='signer' then
  if tg_op='DELETE' then raise exception 'DI/DR requester cannot be deleted'; end if;
  if new.document_id is distinct from old.document_id
   or new.name is distinct from old.name
   or new.email is distinct from old.email
   or new.role_label is distinct from old.role_label
   or new.signing_order is distinct from old.signing_order
   or new.recipient_type is distinct from old.recipient_type
  then raise exception 'DI/DR requester identity is immutable'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$$;
revoke execute on function public.onosign_lock_catalogue_requester() from public,anon,authenticated;
create trigger onosign_lock_catalogue_requester_trg before update or delete
on public.recipients for each row execute function public.onosign_lock_catalogue_requester();
