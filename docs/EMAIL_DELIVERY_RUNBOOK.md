# OnoSign — transactional email delivery runbook

**Status: NOT ENABLED.** The database outbox and the standalone Resend adapter
exist for a future controlled sender. No outbox worker is configured, and
there is no public endpoint that invokes `sendViaResend`.

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
4. Create a dedicated privileged outbox worker whose credentials are held
   only on the server. It must lease one queued item atomically, recheck
   all document/recipient permissions and signing order in the same
   transaction, then call the mail adapter with a stable outbox UUID
   idempotency key. Add concurrency and retry tests.
5. Record the provider ID and delivery state, with bounce/webhook verification,
   retries and a dead-letter policy. Never mark a recipient signed or a
   document completed merely because a provider accepted an email.
6. Recheck invitation expiry, token invalidation, recipient authentication,
   PDF integrity, user consent, document status, final PDF creation and archive
   retention before enabling any active send.

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
  and safe retryability classification. **Not used by a worker yet.**
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
