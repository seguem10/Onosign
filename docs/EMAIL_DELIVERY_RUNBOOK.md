# OnoSign — transactional email delivery runbook

**Status: NOT ENABLED.** A secret-protected worker and Resend adapter
are now implemented, but **both external invitation and actual signature
dispatch stay blocked** until production release acceptance. No credentials
or sending flags have been enabled by this work.

## Prerequisites (operator must provide and authorize)

1. Choose and verify an organization-owned sending domain for OnoSign.
   Configure the DNS records requested by the chosen provider (SPF/DKIM, and
   DMARC policy as recommended by corporate email administrators).
2. Approve who may receive hotel and head-office documents, including
   external RAF/DG or other recipients; obtain accurate verified work addresses.
3. Configure secrets **server-side only**, never in `NEXT_PUBLIC_*`:
   `RESEND_API_KEY`, `ONOSIGN_SENDER_EMAIL`,
   `ONOSIGN_APP_ORIGIN`, and `ONOSIGN_EMAIL_DELIVERY_ENABLED`.
   The last setting must stay **false** until the complete signature
   pipeline and legal/security acceptance tests pass.
4. Validate the new privileged outbox worker in staging, including revoked
   signers, concurrency, crash recovery, retries and provider idempotency.
5. Record the provider ID and delivery state, with bounce/webhook verification,
   retries and a dead-letter policy. Never mark a recipient signed or a
   document completed merely because a provider accepted an email.
6. Recheck invitation expiry, token invalidation, recipient authentication,
   PDF integrity, user consent, document status, final PDF creation and archive
   retention before enabling any active send.

## Backend-only delivery worker (disabled)

The endpoint `POST /api/internal/delivery` does not accept user sessions as
authorization. It requires every server-side setting below:

- `ONOSIGN_EMAIL_DELIVERY_ENABLED=true` AND
  `ONOSIGN_SIGNATURE_DISPATCH_ENABLED=true` (both must be exactly `true`).
- `ONOSIGN_OUTBOX_WORKER_SECRET`: an independent random string at least
  32 characters, supplied in `Authorization: Bearer ...`.
- `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
  `ONOSIGN_SENDER_EMAIL`, `ONOSIGN_APP_ORIGIN`, plus the project URL.

When deliberately enabled after acceptance tests, the worker requeues expired
leases, leases no more than five jobs, validates the recipient account, status,
expiry, original digest and signing order, and submits a single provider request
per stable outbox idempotency key. Successful provider acceptance is only an
email delivery attempt, not confirmation of a document signature. Jobs that
exhaust retries or cannot pass validation enter manual review.

**Do not enable these flags in Preview just to see an email arrive.**
The database dispatch guard remains enabled; real invitations are not ready
for use. Configure a secret-authenticated scheduler, verified sending domain,
webhook authentication, staging tests, monitoring and rollback before release.

## Current implementation

- `public.onosign_delivery_outbox`: private, no grants or RLS policies for
  regular users; no items queued by the current app.
- `public.onosign_invitation_secrets`: only a SHA-256 digest may be stored;
  no raw invitation secret is persisted by this schema.
- `public.onosign_validate_delivery_item()`: rejects inconsistent documents,
  expired signatures, recipients out of signing order and missing PDF fields.
- `src/lib/server/signature-mail.ts`: French text/HTML templates with HTML
  escaping and validated HTTPS signer links.
- `src/lib/server/resend-delivery.ts`: provider integration with explicit
  `enabled` input, HTTPS request, 10-second timeout, stable idempotency key,
  and safe retryability classification. Used only by the dormant, dual-gated worker.
- `tests/signature-mail.test.mjs` and
  `tests/resend-delivery.test.mjs`: isolated tests, using fake network
  responses; no real emails are sent.

Resend idempotency keys are valid for a limited period (currently 24 hours);
the application outbox must enforce durable deduplication independently.
See https://resend.com/changelog/idempotency-keys and the
provider API specification at
https://github.com/resend/resend-openapi/blob/main/resend.yaml.

## Rollout restriction

The database guard `onosign_block_unvalidated_blueprint_dispatch_trigger`
must remain enabled. The seeded central DI/DR models must remain inactive
until the sign/envelope/final-PDF flows are fully implemented and validated.
Do not merge this branch to `main` solely because build checks pass.
