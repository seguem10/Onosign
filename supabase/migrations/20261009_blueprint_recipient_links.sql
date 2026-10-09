-- Immutable mapping of recipients to catalogue step and financial role.
-- No client can claim a power-of-attorney role on a recipient.
create table if not exists public.onosign_blueprint_recipient_links (
  recipient_id uuid primary key references public.recipients(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  blueprint_step_id uuid not null references public.signature_blueprint_steps(id),
  authorization_role text not null check (authorization_role in ('none','power_of_attorney')),
  created_at timestamptz not null default now(),
  unique(document_id,blueprint_step_id)
);
alter table public.onosign_blueprint_recipient_links enable row level security;
revoke all on public.onosign_blueprint_recipient_links from anon,authenticated;
create index if not exists onosign_recipient_links_document_idx
  on public.onosign_blueprint_recipient_links(document_id);

-- Freeze the authority metadata of any step already used in a document.
create or replace function public.onosign_lock_used_blueprint_step()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.onosign_blueprint_recipient_links l
             where l.blueprint_step_id = old.id) then
    raise exception 'Blueprint step already assigned to a document';
  end if;
  return coalesce(new,old);
end;
$$;
drop trigger if exists onosign_lock_used_blueprint_step_trigger on public.signature_blueprint_steps;
create trigger onosign_lock_used_blueprint_step_trigger
before update or delete on public.signature_blueprint_steps
for each row execute function public.onosign_lock_used_blueprint_step();
