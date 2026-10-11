-- One initial invitation per recipient; reminders may repeat when authorized.
alter table public.onosign_delivery_outbox drop constraint if exists onosign_one_first_invite;
create unique index if not exists onosign_delivery_first_invite_unique
  on public.onosign_delivery_outbox(recipient_id)
  where kind='signature_invitation';

-- A used token may also be revoked as a defense-in-depth measure.
alter table public.onosign_invitation_secrets
  drop constraint if exists onosign_invitation_secrets_check1;
