import test from "node:test";
import assert from "node:assert/strict";
import {
  canRecipientSign, makeInvitationSecret, matchesInvitationSecret,
} from "../src/lib/server/signing-engine.ts";

const first = { id: "requester", email: "requester@example.org", signingOrder: 1, recipientType: "signer", status: "sent" };
const second = { id: "attorney1", email: "attorney@example.org", signingOrder: 2, recipientType: "signer", status: "pending" };
const third = { id: "attorney2", email: "attorney2@example.org", signingOrder: 3, recipientType: "signer", status: "pending" };

test("new invitation secrets are unpredictable and verify only against their hash", () => {
  const a = makeInvitationSecret();
  const b = makeInvitationSecret();
  assert.notEqual(a.token, b.token);
  assert.notEqual(a.tokenHash, b.tokenHash);
  assert.equal(a.token.length, 43);
  assert.equal(matchesInvitationSecret(a.token, a.tokenHash), true);
  assert.equal(matchesInvitationSecret(b.token, a.tokenHash), false);
  assert.equal(matchesInvitationSecret(a.token.slice(0, -1) + "!", a.tokenHash), false);
  assert.equal(matchesInvitationSecret(a.token, "garbage"), false);
});

test("only the current signer can act before the next signer", () => {
  assert.deepEqual(canRecipientSign({ documentStatus: "sent", recipientId: "requester", recipients: [first, second, third] }), { allowed: true });
  assert.deepEqual(canRecipientSign({ documentStatus: "sent", recipientId: "attorney1", recipients: [first, second, third] }), { allowed: false, reason: "recipient_not_pending_signature" });
  assert.deepEqual(canRecipientSign({ documentStatus: "sent", recipientId: "attorney1", recipients: [
    { ...first, status: "signed" }, { ...second, status: "sent" }, third,
  ] }), { allowed: true });
  assert.deepEqual(canRecipientSign({ documentStatus: "partially_signed", recipientId: "attorney2", recipients: [
    { ...first, status: "signed" }, { ...second, status: "viewed" }, { ...third, status: "sent" },
  ] }), { allowed: false, reason: "previous_signer_not_finished" });
});

test("an unopened, expired or completed document cannot be signed", () => {
  assert.deepEqual(canRecipientSign({ documentStatus: "draft", recipientId: "requester", recipients: [first] }), { allowed: false, reason: "document_not_active" });
  assert.deepEqual(canRecipientSign({ documentStatus: "completed", recipientId: "requester", recipients: [first] }), { allowed: false, reason: "document_not_active" });
  assert.deepEqual(canRecipientSign({ documentStatus: "sent", expiresAt: "2020-01-01T00:00:00Z", recipientId: "requester", recipients: [first] }), { allowed: false, reason: "invitation_expired" });
  assert.deepEqual(canRecipientSign({ documentStatus: "sent", expiresAt: "invalid", recipientId: "requester", recipients: [first] }), { allowed: false, reason: "invitation_expired" });
});

test("duplicate identities, signer positions, decline and non-signers are denied", () => {
  assert.deepEqual(canRecipientSign({ documentStatus: "sent", recipientId: "requester", recipients: [first, { ...second, email: "REQUESTER@example.org" }] }), { allowed: false, reason: "invalid_signing_chain" });
  assert.deepEqual(canRecipientSign({ documentStatus: "sent", recipientId: "requester", recipients: [first, { ...second, signingOrder: 1 }] }), { allowed: false, reason: "invalid_signing_chain" });
  assert.deepEqual(canRecipientSign({ documentStatus: "sent", recipientId: "requester", recipients: [{ ...first, status: "declined" }] }), { allowed: false, reason: "recipient_not_pending_signature" });
  assert.deepEqual(canRecipientSign({ documentStatus: "sent", recipientId: "cc", recipients: [first, { id:"cc", email:"cc@example.org", signingOrder:2, recipientType:"cc", status:"sent" }] }), { allowed: false, reason: "recipient_not_signer" });
  assert.deepEqual(canRecipientSign({ documentStatus: "sent", recipientId: "requester", recipients: [{ ...first, status: "sent" }, { ...second, status:"declined" }] }), { allowed: false, reason: "signature_chain_declined" });
});
