-- Preserve legacy workspace sharing while restricting new DI/DR PDFs and
-- associated draft metadata to the creator and authorized admins.
-- No existing DI/DR documents are present at migration time.
create policy onosign_private_catalogue_documents on public.documents
as restrictive for select to authenticated
using (
  document_type is null
  or created_by = (select auth.uid())
  or public.is_workspace_admin(workspace_id)
  or exists (
    select 1 from public.organization_members om
    where om.organization_id = documents.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner','admin')
  )
);

-- Even if broad permissive workspace policies grant access, recipients and
-- PDF field rows of a DI/DR document inherit the document visibility check.
create policy onosign_private_catalogue_recipients on public.recipients
as restrictive for select to authenticated
using (
  exists (
    select 1 from public.documents d where d.id = recipients.document_id
  )
);
create policy onosign_private_catalogue_fields on public.signature_fields
as restrictive for select to authenticated
using (
  exists (
    select 1 from public.documents d where d.id = signature_fields.document_id
  )
);

-- A coworker cannot edit a different requester's DI/DR draft.
create policy onosign_owner_catalogue_recipient_insert on public.recipients
as restrictive for insert to authenticated
with check (
  exists (
    select 1 from public.documents d where d.id = recipients.document_id
      and (d.document_type is null or (d.created_by = (select auth.uid()) and d.status = 'draft'))
  )
);
create policy onosign_owner_catalogue_recipient_update on public.recipients
as restrictive for update to authenticated
using (
  exists (
    select 1 from public.documents d where d.id = recipients.document_id
      and (d.document_type is null or (d.created_by = (select auth.uid()) and d.status = 'draft'))
  )
)
with check (
  exists (
    select 1 from public.documents d where d.id = recipients.document_id
      and (d.document_type is null or (d.created_by = (select auth.uid()) and d.status = 'draft'))
  )
);
create policy onosign_owner_catalogue_recipient_delete on public.recipients
as restrictive for delete to authenticated
using (
  exists (
    select 1 from public.documents d where d.id = recipients.document_id
      and (d.document_type is null or (d.created_by = (select auth.uid()) and d.status = 'draft'))
  )
);

-- Prevent direct updates to another creator's DI/DR document.
create policy onosign_owner_catalogue_document_update on public.documents
as restrictive for update to authenticated
using (document_type is null or (created_by = (select auth.uid()) and status = 'draft'))
with check (document_type is null or (created_by = (select auth.uid()) and status = 'draft'));

-- Storage SELECT keeps the existing legacy document sharing, but newly
-- created DI/DR PDFs cannot be fetched directly by unrelated hotel staff.
drop policy if exists workspace_members_can_read_documents on storage.objects;
create policy workspace_members_can_read_documents on storage.objects
for select to authenticated using (
  bucket_id='documents'
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
  and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or public.is_workspace_admin(((storage.foldername(name))[1])::uuid)
    or exists (
      select 1 from public.documents d
      where d.storage_path = name and d.document_type is null
    )
  )
);
