-- OnoSign final-PDF archive foundation (dormant until a tested signing pipeline).
-- No signature is enabled and no existing original or document is changed.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('onosign-final-pdfs','onosign-final-pdfs',false,20971520,array['application/pdf']::text[])
on conflict (id) do update set
  public=false,file_size_limit=20971520,
  allowed_mime_types=array['application/pdf']::text[];

create table if not exists public.onosign_final_artifacts (
  document_id uuid primary key references public.documents(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint not null check (byte_size between 5 and 20971520),
  signature_count integer not null check (signature_count >= 1),
  evidence_sha256 text not null check (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  finalized_at timestamptz not null default now()
);
create index if not exists onosign_final_artifacts_workspace_idx
on public.onosign_final_artifacts(workspace_id,finalized_at desc);
alter table public.onosign_final_artifacts enable row level security;
revoke all on public.onosign_final_artifacts from public,anon,authenticated;

create or replace function public.onosign_final_artifact_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  d public.documents%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Final PDF archival records cannot be modified or deleted';
  end if;
  select * into d from public.documents where id=new.document_id for share;
  if not found or d.status is distinct from 'completed'
    or d.signature_blueprint_id is null
    or d.document_type not in ('DI','DR')
    or new.workspace_id is distinct from d.workspace_id
    or new.organization_id is distinct from d.organization_id
    or d.final_sha256 is distinct from new.sha256
    or new.storage_path is distinct from
       (d.organization_id::text||'/'||d.workspace_id::text||'/'||d.id::text||'/final.pdf')
  then raise exception 'Final PDF cannot be archived without a completed validated envelope'; end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id='onosign-final-pdfs' and o.name=new.storage_path
      and o.metadata->>'mimetype'='application/pdf'
  ) then raise exception 'Final PDF object unavailable in private archive'; end if;
  return new;
end;
$$;
revoke execute on function public.onosign_final_artifact_guard() from public,anon,authenticated;
create trigger onosign_final_artifact_guard_trigger before insert or update or delete
on public.onosign_final_artifacts for each row execute function public.onosign_final_artifact_guard();
