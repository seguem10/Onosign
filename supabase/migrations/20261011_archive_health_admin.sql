-- Admin-only operational readiness for the future final archive.
-- Aggregates across organizations administered by the current session.
create or replace function public.onosign_archive_health()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_total bigint;
  v_missing bigint;
  v_archive_count bigint;
  v_private boolean;
begin
  if (select auth.uid()) is null or not exists(
    select 1 from public.organization_members om
    where om.user_id=(select auth.uid()) and om.role in ('owner','admin')
  ) then raise exception 'Administration required'; end if;

  select count(*) into v_total
  from public.documents d
  where d.document_type in ('DI','DR') and d.status='completed'
    and exists(select 1 from public.organization_members om
      where om.organization_id=d.organization_id
      and om.user_id=(select auth.uid()) and om.role in ('owner','admin'));

  select count(*) into v_missing
  from public.documents d
  where d.document_type in ('DI','DR') and d.status='completed'
    and not exists(select 1 from public.onosign_final_artifacts a
      where a.document_id=d.id)
    and exists(select 1 from public.organization_members om
      where om.organization_id=d.organization_id
      and om.user_id=(select auth.uid()) and om.role in ('owner','admin'));

  select count(*) into v_archive_count
  from public.onosign_final_artifacts a
  where exists(select 1 from public.organization_members om
    where om.organization_id=a.organization_id
      and om.user_id=(select auth.uid()) and om.role in ('owner','admin'));

  select exists(select 1 from storage.buckets b
    where b.id='onosign-final-pdfs' and b.public=false
      and b.file_size_limit=20971520) into v_private;

  return jsonb_build_object(
    'final_bucket_private',v_private,
    'registered_artifacts',v_archive_count,
    'completed_documents',v_total,
    'missing_archives',v_missing,
    'archive_processing_enabled',false,
    'verified_at',now()
  );
end;
$$;
revoke execute on function public.onosign_archive_health() from public,anon;
grant execute on function public.onosign_archive_health() to authenticated;
