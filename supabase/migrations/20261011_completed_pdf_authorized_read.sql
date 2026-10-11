-- Controlled downloads of completed, immutable final PDFs.
-- Only the requester, tenant admins, or the exact confirmed and signed recipient
-- can access an archived final artifact. Nothing is available before completion.
create or replace function public.onosign_can_read_archived_pdf(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.onosign_final_artifacts a
    join public.documents d on d.id=a.document_id
    where a.storage_path=p_path
      and d.status='completed'
      and d.final_sha256=a.sha256
      and (
        (
          d.created_by=(select auth.uid())
          and exists(
            select 1 from public.workspace_members wm
            where wm.workspace_id=d.workspace_id and wm.user_id=(select auth.uid())
          )
        )
        or exists(
          select 1 from public.organization_members om
          where om.organization_id=d.organization_id
            and om.user_id=(select auth.uid()) and om.role in ('owner','admin')
        )
        or exists(
          select 1 from public.recipients r
          join auth.users u on u.id=(select auth.uid())
          where r.document_id=d.id
            and r.recipient_type='signer' and r.status='signed'
            and u.email_confirmed_at is not null
            and lower(btrim(r.email))=lower(btrim(u.email))
            and (
              select count(*) from public.recipients matched
              where matched.document_id=d.id and matched.recipient_type='signer'
                and lower(btrim(matched.email))=lower(btrim(u.email))
            )=1
        )
      )
  );
$$;
revoke execute on function public.onosign_can_read_archived_pdf(text) from public,anon;
grant execute on function public.onosign_can_read_archived_pdf(text) to authenticated;

create policy onosign_read_completed_final_pdf on storage.objects
for select to authenticated using (
  bucket_id='onosign-final-pdfs'
  and (select auth.uid()) is not null
  and public.onosign_can_read_archived_pdf(name)
);

create or replace function public.onosign_final_artifact_info(p_document_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'document_id',a.document_id,
    'storage_path',a.storage_path,
    'sha256',a.sha256,
    'evidence_sha256',a.evidence_sha256,
    'byte_size',a.byte_size,
    'signature_count',a.signature_count,
    'finalized_at',a.finalized_at
  )
  from public.onosign_final_artifacts a
  join public.documents d on d.id=a.document_id
  where a.document_id=p_document_id
    and d.status='completed' and d.final_sha256=a.sha256
    and (select auth.uid()) is not null
    and public.onosign_can_read_archived_pdf(a.storage_path);
$$;
revoke execute on function public.onosign_final_artifact_info(uuid) from public,anon;
grant execute on function public.onosign_final_artifact_info(uuid) to authenticated;
