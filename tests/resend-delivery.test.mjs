import test from "node:test";
import assert from "node:assert/strict";
import { sendViaResend } from "../src/lib/server/resend-delivery.ts";

const request = {
  outboxId: "11111111-2222-3333-4444-555555555555",
  recipientEmail: "raf@example.org",
  mail: { subject: "OnoSign — Document à signer", html: "<p>Bonjour</p>", text: "Bonjour" },
};
const enabled = {
  enabled: true,
  apiKey: "re_test_in_memory_only",
  verifiedSender: "signatures@onomo.example",
};

test("adapter never attempts to send when delivery is disabled", async () => {
  let calls = 0;
  const result = await sendViaResend(request, { ...enabled, enabled: false },
    async () => { calls += 1; throw new Error("should not be called"); });
  assert.deepEqual(result, { delivered: false, reason: "disabled", retryable: false });
  assert.equal(calls, 0);
});

test("adapter requires a verified sender address and provider credentials", async () => {
  const result = await sendViaResend(request,
    { enabled: true, apiKey: undefined, verifiedSender: "" },
    async () => { throw new Error("must not connect"); });
  assert.deepEqual(result, { delivered: false, reason: "configuration", retryable: false });
});

test("adapter sends only a POST with a stable idempotency key", async () => {
  let calls = 0;
  const result = await sendViaResend(request, enabled, async (url, options) => {
    calls++;
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Idempotency-Key"], `onosign-invite-${request.outboxId}`);
    assert.equal(options.headers.Authorization, "Bearer re_test_in_memory_only");
    const body = JSON.parse(options.body);
    assert.deepEqual(body.to, ["raf@example.org"]);
    assert.equal(body.from, "signatures@onomo.example");
    assert.equal(body.subject, request.mail.subject);
    return new Response(JSON.stringify({ id: "mail-test-123" }), { status: 200 });
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { delivered: true, providerMessageId: "mail-test-123" });
});

test("transient provider errors can be retried but invalid payloads cannot", async () => {
  const rateLimit = await sendViaResend(request, enabled,
    async () => new Response("rate limited", { status: 429 }));
  assert.deepEqual(rateLimit, { delivered: false, reason: "provider_failure", retryable: true });
  const rejected = await sendViaResend(request, enabled,
    async () => new Response("bad request", { status: 400 }));
  assert.deepEqual(rejected, { delivered: false, reason: "provider_failure", retryable: false });
  const invalid = await sendViaResend(
    { ...request, recipientEmail: "not-an-email" }, enabled,
    async () => { throw new Error("should not call"); });
  assert.deepEqual(invalid, { delivered: false, reason: "invalid_request", retryable: false });
  const network = await sendViaResend(request, enabled,
    async () => { throw new Error("network down"); });
  assert.deepEqual(network, { delivered: false, reason: "network_failure", retryable: true });
});
