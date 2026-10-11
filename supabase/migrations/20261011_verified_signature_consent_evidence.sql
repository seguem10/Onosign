-- Future verified consent evidence for individual signing decisions.
-- No client INSERT/UPDATE/DELETE/SELECT grants and no signing endpoint exists.
create table if not exists public.onosign_signature_consents (
  recipient_id uuid primary key references public.recipients(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  verified_email text not null,
  consent_version text not null default 'onosign-v1',
  consent_statement text not null,
  original_sha256 text not null check (original_sha256 ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz not null default now(),
  user_agent_sha256 text check (
    user_agent_sha256 is null or user_agent_sha256 ~ '^[a-f0-9]{64}$'
  ),
  unique(document_id,recipient_id)
);
create index if not exists onosign_consents_document_idx
  on public.onosign_signature_consents(document_id,occurred_at);
alter table public.onosign_signature_consents enable row level security;
revoke all on public.onosign_signature_consents from public,anon,authenticated;

create or replace function public.onosign_guard_signature_consent()
returns trigger language plpgsql set search_path='' as $$
declare
  d public.documents%rowtype;
  r public.recipients%rowtype;
  v_email text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Signature consent records cannot be changed or erased';
  end if;
  if (select auth.uid()) is null
    or new.actor_user_id is distinct from (select auth.uid())
  then raise exception 'Verified signatory account required'; end if;

  select u.email into v_email from auth.users u
  where u.id=(select auth.uid()) and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'Signatory e-mail not verified'; end if;

  select * into d from public.documents
  where id=new.document_id for share;
  select * into r from public.recipients
  where id=new.recipient_id and document_id=new.document_id for share;

  if d.id is null or d.document_type not in ('DI','DR')
    or d.signature_blueprint_id is null
    or d.status not in ('sent','viewed','partially_signed')
    or (d.expires_at is not null and d.expires_at<=now())
    or r.id is null or r.recipient_type<>'signer'
    or r.status not in ('sent','viewed')
    or lower(btrim(r.email))<>lower(btrim(v_email))
    or new.original_sha256 is distinct from d.original_sha256
  then raise exception 'Signatory or document not authorized for consent'; end if;
  if new.consent_version<>'onosign-v1'
    or new.consent_statement is distinct from
      'Je confirme avoir lu le document et consens à le signer électroniquement.'
  then raise exception 'Explicit accepted consent statement is mandatory'; end if;
  if exists (
    select 1 from public.recipients earlier
    where earlier.document_id=d.id and earlier.recipient_type='signer'
      and earlier.signing_order<r.signing_order and earlier.status<>'signed'
  ) then raise exception 'Previous signatures still pending'; end if;
  if exists (
    select 1 from public.recipients duplicate
    where duplicate.document_id=d.id and duplicate.recipient_type='signer'
      and duplicate.id<>r.id
      and lower(btrim(duplicate.email))=lower(btrim(v_email))
  ) then raise exception 'Duplicate signer identity in this circuit'; end if;
  if not exists (
    select 1 from public.signature_fields f
    where f.document_id=d.id and f.recipient_id=r.id
      and f.field_type='signature'
  ) then raise exception 'Required PDF signature field is missing'; end if;

  new.verified_email := lower(btrim(v_email));
  new.occurred_at := now();
  return new;
end;
$$;
revoke execute on function public.onosign_guard_signature_consent() from public,anon,authenticated;
create trigger onosign_guard_signature_consent_trg
before insert or update or delete on public.onosign_signature_consents
for each row execute function public.onosign_guard_signature_consent();
