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
- [ ] CI installation, lint, typecheck and production build pass on this branch.

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
