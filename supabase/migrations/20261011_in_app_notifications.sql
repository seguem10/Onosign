-- In-app draft/recipient notifications; never sends external mail.
create table if not exists public.onosign_notifications(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 document_id uuid not null references public.documents(id) on delete cascade,
 recipient_id uuid references public.recipients(id) on delete cascade,
 kind text not null check(kind in ('draft_created','ready_to_sign')),
 title text not null,
 created_at timestamptz not null default now(),
 read_at timestamptz,
 unique(document_id,user_id,kind)
);
create index if not exists onosign_notifications_user_idx on public.onosign_notifications(user_id,created_at desc);
alter table public.onosign_notifications enable row level security;
revoke all on public.onosign_notifications from public,anon,authenticated;
grant select on public.onosign_notifications to authenticated;
grant update(read_at) on public.onosign_notifications to authenticated;
create policy onosign_notifications_owner_read on public.onosign_notifications
for select to authenticated using (user_id=(select auth.uid()));
create policy onosign_notifications_owner_mark_read on public.onosign_notifications
for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create or replace function public.onosign_notify_document_created()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.document_type in ('DI','DR') then
  insert into public.onosign_notifications(user_id,document_id,kind,title)
  values(new.created_by,new.id,'draft_created','Brouillon créé : '||new.title)
  on conflict(document_id,user_id,kind) do nothing;
 end if;
 return new;
end;
$$;
revoke execute on function public.onosign_notify_document_created() from public,anon,authenticated;
create trigger onosign_notify_document_created_trg
after insert on public.documents for each row execute function public.onosign_notify_document_created();

create or replace function public.onosign_notify_signer_ready()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 v_user uuid;
 v_document public.documents%rowtype;
begin
 if new.status='sent' and old.status is distinct from 'sent'
  and new.recipient_type='signer' then
  select * into v_document from public.documents where id=new.document_id;
  if v_document.document_type in ('DI','DR')
   and v_document.status in ('sent','viewed','partially_signed') then
   select u.id into v_user from auth.users u
   where lower(btrim(u.email))=lower(btrim(new.email))
    and u.email_confirmed_at is not null;
   if v_user is not null then
    insert into public.onosign_notifications(user_id,document_id,recipient_id,kind,title)
    values(v_user,new.document_id,new.id,'ready_to_sign','Votre signature est demandée : '||v_document.title)
    on conflict(document_id,user_id,kind) do nothing;
   end if;
  end if;
 end if;
 return new;
end;
$$;
revoke execute on function public.onosign_notify_signer_ready() from public,anon,authenticated;
create trigger onosign_notify_signer_ready_trg
after update of status on public.recipients for each row execute function public.onosign_notify_signer_ready();
