import test from "node:test";
import assert from "node:assert/strict";
import {
  signerPortalUrl, renderOnoSignInvitation, retryDelaySeconds,
} from "../src/lib/server/signature-mail.ts";

const id = "11111111-2222-3333-4444-555555555555";
const origin = "https://onosign.example.org";

test("signer links are HTTPS, have a canonical path and exclude bearer tokens", () => {
  assert.equal(signerPortalUrl(origin, id), `${origin}/sign/${id}`);
  for (const bad of ["http://onosign.example.org", "javascript:alert(1)",
    "https://admin:secret@onosign.example.org", "https://onosign.example.org/path",
    "https://onosign.example.org/?next=https://evil.example"]) {
    assert.throws(() => signerPortalUrl(bad, id), /HTTPS application origin|URL/);
  }
  assert.throws(() => signerPortalUrl(origin, "../users"), /Invalid document identifier/);
});

test("HTML template escapes all variable content and never embeds HTML from names", () => {
  const mail = renderOnoSignInvitation({
    recipientName: "<img src=x onerror=alert(1)>",
    organizationName: "ONOMO & Partners",
    documentTitle: '<script>alert("x")</script>',
    appOrigin: origin, documentId: id,
  });
  assert.equal(mail.subject, "OnoSign — Document en attente de signature");
  assert.ok(mail.html.includes("&lt;img src=x"));
  assert.ok(mail.html.includes("&lt;script&gt;"));
  assert.ok(mail.html.includes("ONOMO &amp; Partners"));
  assert.ok(!mail.html.includes("<script>"));
  assert.ok(mail.html.includes(`${origin}/sign/${id}`));
  assert.ok(!mail.html.includes("Authorization"));
});

test("mail rejects invalid links and malformed expiration dates", () => {
  const base = { recipientName: "Raf", organizationName: "ONOMO", documentTitle: "DR" };
  assert.throws(() => renderOnoSignInvitation({ ...base, appOrigin: "http://example.org", documentId: id }));
  assert.throws(() => renderOnoSignInvitation({ ...base, appOrigin: "https://example.org/path", documentId: id }));
  assert.throws(() => renderOnoSignInvitation({
    ...base, appOrigin: origin, documentId: id, expiry: "not-a-date",
  }));
});

test("retry scheduling is exponential but bounded", () => {
  assert.equal(retryDelaySeconds(0), 60);
  assert.equal(retryDelaySeconds(1), 120);
  assert.equal(retryDelaySeconds(5), 1920);
  assert.equal(retryDelaySeconds(10), 21600);
  assert.equal(retryDelaySeconds(99), 21600);
  assert.throws(() => retryDelaySeconds(-1));
  assert.throws(() => retryDelaySeconds(0.5));
});
