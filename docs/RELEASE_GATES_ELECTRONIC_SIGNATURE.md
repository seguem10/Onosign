# OnoSign — Release gates for electronic signatures

**Current release classification: DEVELOPMENT / NOT READY FOR REAL SIGNATURE.**

This file defines implementation and acceptance gates. Checking these boxes requires evidence from real integration tests, not only UI demos. Do not activate seeded DI/DR blueprints, enable dispatch, or deploy to users merely because a screen appears complete.

## Existing foundations

- [x] Workspace-level ONOMO hotel catalogue and central model configuration.
- [x] DI rule: two distinct power-of-attorney signers from EUR 20,000 inclusive.
- [x] DR rule: second director strictly above EUR 20,000.
- [x] Read-only preflight and database trigger that blocks blueprint dispatch.
- [x] Technical append-only event timeline for new events (not legal signature evidence).
- [x] Draft creation stores a client-computed original SHA-256 for newly uploaded PDFs.
- [x] CI install, TypeScript, ESLint, signing-engine unit tests, production dependency audit and Next.js build passed (GitHub Actions run 38098004737, commit `4a24cc8`).
- [x] Server-side read-only review re-checks the active circuit and compares uploaded PDF bytes with the immutable source SHA-256.
- [x] New DI/DR source PDF path/hash cannot be updated; storage disallows overwrite of originals or deletion of linked PDFs.
- [x] New DI/DR metadata, recipients, fields and source PDFs are scoped to requester and authorized administrators (policies verified, real multi-account penetration tests still needed).
- [x] Private PDF upload bucket limits new files to 20 MiB and MIME application/pdf.
- [x] Ten read-only Supabase security invariants passed; stored in `supabase/tests/onomo_release_security_readonly.sql`.
- [x] Server-only token hashing and ordered signing decision primitives have passing unit tests; **these primitives do not yet send or process signatures**.
- [x] New DI/DR drafts and the verified requester are inserted in **one database transaction**; direct DI/DR inserts are blocked. Unused PDF uploads are cleaned up on failure.
- [x] Requester identity and first signing position are locked for new DI/DR; a second first signer is rejected by a unique index.
- [x] User-facing dashboard loads actual own-document counts, recent drafts and only assigned hotel workspaces, replacing dead placeholder counters.
- [x] Internal /notifications inbox logs created drafts immediately and is wired for future sent-to-signer events, with owner-only RLS and mark-as-read. **No external e-mails are sent.**
- [x] `/sign` shows read-only tasks only for confirmed Supabase Auth e-mails.
- [x] Shared EUR parser and tests cover 0, 4,999.99, 5,000, 19,999.99, 20,000, 20,000.01, and 50,000 and reject malformed amounts. This corrects a blocked DI/DR input form.
- [x] Seven additional read-only database security checks passed for the atomic draft, requester lock, and notification privileges.
- [ ] Exercise the full new-document browser flow with a dedicated authorized QA user and sample PDF in a non-production workspace.
- [x] Read-only signer task lookup checks Supabase Auth verified e-mail against the intended recipient and ordered signer eligibility; the `/sign/[id]` portal clearly keeps signing disabled.
- [x] Original PDF debug traces containing recipient data or signed URLs were removed from the document editor.
- [ ] Active authenticated recipient signing, notifications, PDF stamping and completed envelope lifecycle.

## P0 — must complete before any external invite

- [ ] Authenticated, server-owned atomic dispatch transaction checks workspace, creator, document draft state and actual blueprint; locks relevant rows and re-evaluates financial and PDF field rules.
- [ ] Dispatch is idempotent and uses an outbox for retryable email delivery; no e-mail should be sent before the database transaction commits.
- [ ] Invitation links use cryptographically secure random bearer tokens; only a salted/hashed representation is persisted, expire and can be revoked; attempts are rate limited.
- [ ] Server verifies recipient identity to the agreed assurance level; recipients cannot view documents, download the PDF or sign for anyone else.
- [ ] Signing order is enforced server-side with row locks; concurrent submissions cannot skip required signers.
- [ ] Signature consent UI presents document and exact intent; records timestamp and authentication context, without claiming cryptographic identity guarantees not actually implemented.
- [ ] All signature events are immutable and survive normal document deletion according to the approved retention policy.
- [ ] Server constructs the final PDF (never trusts client-submitted signed bytes); verifies expected signature fields, final digest and archival integrity.
- [ ] Original and final PDFs use separate immutable storage objects with scoped download authorization. Private bucket and storage RLS must be independently tested.
- [ ] Terminal statuses, completion event, expirations, cancellations and reminders are reconciled by a retryable job.
- [ ] Failure to deliver email must not falsely change recipient signing status or mark a document completed.

## P0 — authorization / correctness tests

- [ ] Anonymous and cross-hotel attempts denied for document data, storage URLs, RPCs and audit.
- [ ] User cannot impersonate owner/RAF/DG or edit blueprint-required recipients.
- [ ] EUR 0, 4,999.99, 5,000, 19,999.99, 20,000, 20,000.01 and 50,000 verified through real end-to-end recipient population and signing.
- [ ] Two separate power-of-attorney signers are distinct people; two DR directors are distinct people when required.
- [ ] Wrong email/token, expired/replayed token, double-click signing, out-of-order signer and forged status transitions all rejected.
- [ ] PDF cannot be swapped after approval; page/coordinates checked against actual PDF; audit includes the correct document digest.
- [ ] Test actual e-mail provider delivery, bounce handling and accessibility/mobile interface.
- [ ] Independent review of audit/retention and applicable electronic-signature legal requirements.

## P1 — operational rollout

- [ ] Configure verified SMTP or transactional mail provider and DNS (SPF, DKIM, DMARC).
- [ ] Assign real, authorized staff accounts to 22 hotels and HQ; collect approved role/email mappings.
- [ ] Obtain business signoff on DI/DR central models and optional signer policies.
- [ ] Activate approved models only after P0 criteria and user acceptance testing.
- [ ] Configure monitoring, alerts, database backups, encryption/secrets and incident response.
- [ ] Confirm Vercel project, preview build, environmental variables and safe rollback; merge to main only after acceptance.

## Important distinctions

*The technical audit table is **not** an electronic signature certificate.* It currently logs lifecycle changes since its creation. Existing historical events are not backfilled. The seeded central DI/DR models are deliberately inactive. Until a tested secure send/sign pipeline is present, the database dispatch guard **must remain enabled**.

## Preview build (not production)

- Branch: `feature/workflow-admin-models` (do not merge into `main` before acceptance).
- Latest verified GitHub quality run: 38098004737 — success.
- Corresponding Vercel preview: `onosign-nglpv3sp0-ono13.vercel.app` — READY (platform build state only, **not** a completed user acceptance test).
- Publishable Supabase preview environment variables configured; the private signature delivery provider and service credential are **not** configured.
- The current database trigger intentionally rejects blueprint document dispatch. Inactive ONOMO hotel DI/DR templates remain inactive.

This release is safe only for development/preview and must not be described as an electronic signature service until the sender/recipient identity, email delivery, encrypted invitation tokens, signed PDF generation and audit evidence have been implemented and independently tested.
