/**
 * Resend adapter for the future privileged outbox worker.
 * This file is never imported from a public route or a client component.
 * No email can be sent unless an operator explicitly enables the transport.
 */
import type { InvitationMail } from "./signature-mail.ts";

export type DeliveryConfig = {
  enabled: boolean;
  apiKey: string | undefined;
  verifiedSender: string | undefined;
};

export type DeliveryRequest = {
  outboxId: string;
  recipientEmail: string;
  mail: InvitationMail;
};

export type DeliveryResult =
  | { delivered: true; providerMessageId: string }
  | { delivered: false; reason: "disabled" | "configuration" | "invalid_request" | "provider_failure" | "network_failure"; retryable: boolean };

const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const address = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

export async function sendViaResend(
  request: DeliveryRequest,
  config: DeliveryConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<DeliveryResult> {
  if (!config.enabled) return { delivered: false, reason: "disabled", retryable: false };
  const sender = config.verifiedSender?.trim() ?? "";
  const key = config.apiKey?.trim() ?? "";
  if (!key.startsWith("re_") || !address.test(sender)) {
    return { delivered: false, reason: "configuration", retryable: false };
  }
  if (!uuid.test(request.outboxId) || !address.test(request.recipientEmail) ||
      request.mail.subject.trim().length < 1 ||
      request.mail.subject.includes("\r") || request.mail.subject.includes("\n") ||
      !request.mail.html || !request.mail.text) {
    return { delivered: false, reason: "invalid_request", retryable: false };
  }

  // The same outbox row always uses a stable provider idempotency key.
  // Resend guarantees provider-side idempotency for a limited time window;
  // persistent local outbox state remains the source of truth.
  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `onosign-invite-${request.outboxId}`,
      },
      body: JSON.stringify({
        from: sender,
        to: [request.recipientEmail],
        subject: request.mail.subject,
        html: request.mail.html,
        text: request.mail.text,
      }),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        delivered: false,
        reason: "provider_failure",
        retryable: response.status === 408 || response.status === 409 ||
          response.status === 429 || response.status >= 500,
      };
    }
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("id" in body) ||
        typeof body.id !== "string" || body.id.length === 0) {
      return { delivered: false, reason: "provider_failure", retryable: true };
    }
    return { delivered: true, providerMessageId: body.id };
  } catch {
    return { delivered: false, reason: "network_failure", retryable: true };
  }
}
