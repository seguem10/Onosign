-- Internal email outbox. No mail is sent and DI/DR dispatch remains locked.
create table public.onosign_email_outbox(
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null references public.documents(id) on delete restrict,
 recipient_id uuid not null references public.recipients(id) on delete restrict,
 event_type text not null check(event_type='signature_invitation'),
 recipient_email text not null,
 recipient_name text not null,
 document_title text not null,
 status text not null default 'queued'
  check(status in ('queued','sending','delivered','retry','manual_review')),
 attempts integer not null default 0 check(attempts>=0 and attempts<=10),
 next_attempt_at timestamptz not null default now(),
 locked_until timestamptz,
 provider_email_id text,
 last_error text,
 sent_at timestamptz,
 created_at timestamptz not null default now(),
 unique(document_id,recipient_id,event_type)
);
create index on public.onosign_email_outbox(status,next_attempt_at,created_at);
alter table public.onosign_email_outbox enable row level security;
revoke all on public.onosign_email_outbox from public,anon,authenticated;
create or replace function public.onosign_enqueue_email_invitation()
returns trigger language plpgsql security definer set search_path='' as $$
declare d public.documents%rowtype;
begin
 if new.recipient_type='signer' and new.status='sent'
  and old.status is distinct from 'sent' then
  select * into d from public.documents where id=new.document_id;
  if d.signature_blueprint_id is not null
   and d.document_type in ('DI','DR')
   and d.status in ('sent','viewed','partially_signed')
   and (d.expires_at is null or d.expires_at>now()) then
   if new.email is null
    or new.email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or (not exists(select 1 from public.onosign_blueprint_recipient_links l
     where l.recipient_id=new.id) and new.signing_order<>1)
   then raise exception 'Unverified signer identity or blueprint step'; end if;
   if exists(select 1 from public.recipients r
     where r.document_id=new.document_id and r.recipient_type='signer'
      and r.signing_order<new.signing_order and r.status<>'signed')
   then raise exception 'Earlier signatures must be completed before invitation'; end if;
   insert into public.onosign_email_outbox
   (document_id,recipient_id,event_type,recipient_email,recipient_name,document_title)
   values(d.id,new.id,'signature_invitation',lower(trim(new.email)),new.name,d.title)
   on conflict(document_id,recipient_id,event_type) do nothing;
  end if;
 end if;
 return new;
end;
$$;
revoke execute on function public.onosign_enqueue_email_invitation() from public,anon,authenticated;
create trigger onosign_enqueue_email_invitation_trg
after update of status on public.recipients
for each row execute function public.onosign_enqueue_email_invitation();
