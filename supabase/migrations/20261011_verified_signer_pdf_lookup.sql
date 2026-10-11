-- Return only metadata necessary for a verified recipient's PDF viewer.
-- The PDF is still downloaded through Storage RLS, never using service_role.
create or replace function public.onosign_signer_pdf_info(p_document_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
   'storage_path',d.storage_path,
   'original_sha256',d.original_sha256,
   'document_id',d.id
 )
 from public.documents d
 join public.recipients r on r.document_id=d.id
 join auth.users u on u.id=(select auth.uid())
 where d.id=p_document_id
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
 limit 1;
$$;
revoke execute on function public.onosign_signer_pdf_info(uuid) from public,anon;
grant execute on function public.onosign_signer_pdf_info(uuid) to authenticated;
