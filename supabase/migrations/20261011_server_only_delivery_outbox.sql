-- Server-only delivery work queue. No delivery worker is enabled.
create table if not exists public.onosign_delivery_outbox (
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null references public.documents(id) on delete restrict,
 recipient_id uuid not null references public.recipients(id) on delete restrict,
 kind text not null check (kind in ('signature_invitation','signature_reminder')),
 status text not null default 'queued'
   check (status in ('queued','processing','delivered','failed','cancelled')),
 attempt_count integer not null default 0 check (attempt_count between 0 and 20),
 next_attempt_at timestamptz not null default now(),
 last_attempt_at timestamptz,
 delivered_at timestamptz,
 provider_message_id text,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint onosign_one_first_invite unique (recipient_id,kind)
);
create index if not exists onosign_outbox_due_idx on public.onosign_delivery_outbox(next_attempt_at,id) where status in ('queued','failed');
create index if not exists onosign_outbox_document_idx on public.onosign_delivery_outbox(document_id);
alter table public.onosign_delivery_outbox enable row level security;
revoke all on public.onosign_delivery_outbox from public,anon,authenticated;

-- A future worker can store only a digest of cryptographically random tokens.
create table if not exists public.onosign_invitation_secrets (
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null references public.documents(id) on delete restrict,
 recipient_id uuid not null references public.recipients(id) on delete restrict,
 token_sha256 text not null unique check (token_sha256 ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,
 used_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 check (expires_at > created_at),
 check (used_at is null or revoked_at is null)
);
create index if not exists onosign_invitation_secrets_recipient_idx on public.onosign_invitation_secrets(recipient_id,expires_at);
alter table public.onosign_invitation_secrets enable row level security;
revoke all on public.onosign_invitation_secrets from public,anon,authenticated;