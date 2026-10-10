-- OnoSign append-only operational audit. Not an electronic-signature evidence certificate.
create table if not exists public.onosign_document_audit (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  event_type text not null,
  actor_id uuid,
  recipient_id uuid,
  previous_status text,
  next_status text,
  occurred_at timestamptz not null default now(),
  constraint onosign_document_audit_event_type_check check (
    event_type in ('document_created','document_status_changed','recipient_added','recipient_status_changed')
  )
);
create index if not exists onosign_document_audit_document_idx
  on public.onosign_document_audit(document_id, occurred_at, id);
alter table public.onosign_document_audit enable row level security;
revoke all on public.onosign_document_audit from public,anon,authenticated;
grant select on public.onosign_document_audit to authenticated;
create policy onosign_audit_read_creator on public.onosign_document_audit
  for select to authenticated using (
    exists (
      select 1 from public.documents d
      join public.workspace_members wm on wm.workspace_id=d.workspace_id
      where d.id=onosign_document_audit.document_id
        and d.created_by=(select auth.uid())
        and wm.user_id=(select auth.uid())
    )
  );
create or replace function public.onosign_record_document_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='documents' then
    if tg_op='INSERT' then
      insert into public.onosign_document_audit(document_id,event_type,actor_id,next_status)
      values (new.id,'document_created',auth.uid(),new.status);
    elsif old.status is distinct from new.status then
      insert into public.onosign_document_audit(document_id,event_type,actor_id,previous_status,next_status)
      values (new.id,'document_status_changed',auth.uid(),old.status,new.status);
    end if;
  elsif tg_table_name='recipients' then
    if tg_op='INSERT' then
      insert into public.onosign_document_audit(document_id,event_type,actor_id,recipient_id,next_status)
      values (new.document_id,'recipient_added',auth.uid(),new.id,new.status);
    elsif old.status is distinct from new.status then
      insert into public.onosign_document_audit(document_id,event_type,actor_id,recipient_id,previous_status,next_status)
      values (new.document_id,'recipient_status_changed',auth.uid(),new.id,old.status,new.status);
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.onosign_record_document_audit() from public,anon,authenticated;
create trigger onosign_document_audit_insert after insert on public.documents
  for each row execute function public.onosign_record_document_audit();
create trigger onosign_document_audit_status after update of status on public.documents
  for each row execute function public.onosign_record_document_audit();
create trigger onosign_recipient_audit_insert after insert on public.recipients
  for each row execute function public.onosign_record_document_audit();
create trigger onosign_recipient_audit_status after update of status on public.recipients
  for each row execute function public.onosign_record_document_audit();
