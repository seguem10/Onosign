/**
 * Server-only signing primitives. They are intentionally NOT wired to any
 * public send/sign endpoint while the secure delivery pipeline is incomplete.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type RecipientSigningState = "pending" | "sent" | "viewed" | "signed" | "declined";
export type RecipientRole = "signer" | "cc" | "viewer";

export type OrderedSigner = {
  id: string;
  email: string;
  signingOrder: number;
  recipientType: RecipientRole;
  status: RecipientSigningState;
};

export type SigningDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

export function makeInvitationSecret(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: createHash("sha256").update(token).digest("hex") };
}

/** Hash-only token storage: the raw bearer token must never be persisted. */
export function matchesInvitationSecret(token: string, expectedHash: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !/^[a-f0-9]{64}$/i.test(expectedHash)) {
    return false;
  }
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(expectedHash, "hex");
  return timingSafeEqual(actual, expected);
}

export function canRecipientSign(input: {
  documentStatus: string;
  expiresAt?: string | null;
  recipientId: string;
  recipients: readonly OrderedSigner[];
  now?: Date;
}): SigningDecision {
  const { documentStatus, expiresAt, recipientId, recipients } = input;
  if (!["sent", "viewed", "partially_signed"].includes(documentStatus)) {
    return { allowed: false, reason: "document_not_active" };
  }
  if (expiresAt !== undefined && expiresAt !== null) {
    const expiry = Date.parse(expiresAt);
    if (!Number.isFinite(expiry) || expiry <= (input.now ?? new Date()).getTime()) {
      return { allowed: false, reason: "invitation_expired" };
    }
  }
  const signerIds = new Set<string>();
  const signerEmails = new Set<string>();
  const signerOrders = new Set<number>();
  for (const recipient of recipients) {
    if (recipient.recipientType !== "signer") continue;
    const email = recipient.email.trim().toLowerCase();
    if (!recipient.id || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !Number.isSafeInteger(recipient.signingOrder) || recipient.signingOrder < 1 ||
        signerIds.has(recipient.id) || signerEmails.has(email) ||
        signerOrders.has(recipient.signingOrder)) {
      return { allowed: false, reason: "invalid_signing_chain" };
    }
    signerIds.add(recipient.id);
    signerEmails.add(email);
    signerOrders.add(recipient.signingOrder);
  }
  const actor = recipients.find((recipient) => recipient.id === recipientId);
  if (!actor || actor.recipientType !== "signer") {
    return { allowed: false, reason: "recipient_not_signer" };
  }
  if (!["sent", "viewed"].includes(actor.status)) {
    return { allowed: false, reason: "recipient_not_pending_signature" };
  }
  for (const recipient of recipients) {
    if (recipient.recipientType !== "signer") continue;
    if (recipient.status === "declined") {
      return { allowed: false, reason: "signature_chain_declined" };
    }
    if (recipient.signingOrder < actor.signingOrder && recipient.status !== "signed") {
      return { allowed: false, reason: "previous_signer_not_finished" };
    }
  }
  return { allowed: true };
}
