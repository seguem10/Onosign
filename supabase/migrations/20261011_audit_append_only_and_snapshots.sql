-- Store original PDF digest and hotel scope for technical lifecycle events.
alter table public.onosign_document_audit add column if not exists source_sha256 text;
alter table public.onosign_document_audit add column if not exists workspace_id uuid;
alter table public.onosign_document_audit add column if not exists organization_id uuid;

create or replace function public.onosign_reject_audit_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
 raise exception 'OnoSign lifecycle events are append-only';
end;
$$;
revoke execute on function public.onosign_reject_audit_mutation() from public,anon,authenticated;
create trigger onosign_audit_immutable before update or delete
on public.onosign_document_audit for each row execute function public.onosign_reject_audit_mutation();