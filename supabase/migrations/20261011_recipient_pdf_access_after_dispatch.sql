-- Confirmed recipient accounts can view the original only after secure dispatch.
-- No original PDF becomes available while its document remains in draft.
create or replace function public.onosign_can_signer_read_pdf(p_storage_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.documents d
  join public.recipients r on r.document_id=d.id
  join auth.users u on u.id=(select auth.uid())
  where d.storage_path=p_storage_path
   and d.signature_blueprint_id is not null
   and d.document_type in ('DI','DR')
   and d.status in ('sent','viewed','partially_signed')
   and (d.expires_at is null or d.expires_at>now())
   and d.original_sha256 ~ '^[a-f0-9]{64}$'
   and u.email_confirmed_at is not null
   and r.recipient_type='signer'
   and r.status in ('sent','viewed','signed')
   and lower(trim(r.email))=lower(trim(u.email))
   and (select count(*) from public.recipients r2
    where r2.document_id=d.id and r2.recipient_type='signer'
      and lower(trim(r2.email))=lower(trim(u.email)))=1
 );
$$;
revoke execute on function public.onosign_can_signer_read_pdf(text) from public,anon;
grant execute on function public.onosign_can_signer_read_pdf(text) to authenticated;
create policy onosign_confirmed_recipient_can_read_sent_pdf
on storage.objects for select to authenticated
using(bucket_id='documents' and public.onosign_can_signer_read_pdf(name));
