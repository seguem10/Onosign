-- Harden the private OnoSign originals bucket.
-- Existing stored PDFs and documents are not modified.
-- Created originals may not be overwritten or renamed by client storage APIs.
drop policy if exists workspace_members_can_update_documents on storage.objects;

-- An authenticated user can only upload into their own directory inside an
-- actual workspace to which they belong; other workspace folders are denied.
drop policy if exists workspace_members_can_upload_documents on storage.objects;
create policy workspace_members_can_upload_documents on storage.objects
for insert to authenticated with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
);

-- Permit removal of the user's own upload ONLY before it is referenced by
-- a document. Prevent removing another signer's or archived source PDF.
drop policy if exists workspace_members_can_delete_documents on storage.objects;
create policy workspace_members_can_delete_documents on storage.objects
for delete to authenticated using (
  bucket_id = 'documents'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
  and not exists (select 1 from public.documents d where d.storage_path = name)
);

-- Storage enforces PDF content type and a server-side upload size limit.
update storage.buckets
set public = false, file_size_limit = 20971520,
    allowed_mime_types = array['application/pdf']::text[]
where id = 'documents';
