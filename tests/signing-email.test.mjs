import test from "node:test";
import assert from "node:assert/strict";
import { createSigningInvitationEmail } from "../src/lib/server/signing-email.ts";

const input = {
  documentId: "e23995af-20c1-4fc7-a400-7bfc0772984c",
  documentTitle: "DI - Matériel IT",
  recipientName: "Directeur",
  recipientEmail: "DIRECTEUR@EXAMPLE.ORG",
  from: "ONOMO <signatures@onomo.example>",
  appUrl: "https://onosign.example.org",
};

test("verified-account email contains only a nonsecret sign-in URL", () => {
  const message = createSigningInvitationEmail(input);
  assert.deepEqual(message.to, ["directeur@example.org"]);
  assert.equal(message.from, input.from);
  assert.match(message.text, /https:\/\/onosign\.example\.org\/sign\/e23995af-20c1-4fc7-a400-7bfc0772984c/);
  assert.match(message.text, /adresse e-mail vérifiée/);
  assert.ok(!message.text.includes("service_role"));
  assert.ok(!message.text.includes("token="));
});

test("rejects invalid origin, address, identifiers and sender injection", () => {
  for (const appUrl of ["http://localhost:3000", "https://evil.example.org/path", "https://user:secret@example.org", "not-a-url"]) {
    assert.throws(() => createSigningInvitationEmail({ ...input, appUrl }));
  }
  assert.throws(() => createSigningInvitationEmail({ ...input, recipientEmail: "bad@example.org\nBcc: victim@example.org" }));
  assert.throws(() => createSigningInvitationEmail({ ...input, documentId: "../another" }));
  assert.throws(() => createSigningInvitationEmail({ ...input, from: "admin@example.org\nBcc: outsider@example.org" }));
});

test("normalizes newline and very long document titles", () => {
  const message = createSigningInvitationEmail({
    ...input, documentTitle: "Compte\r\n".repeat(70),
    recipientName: "Mlle\nDirectrice",
  });
  assert.ok(message.text.includes("Mlle Directrice"));
  assert.ok(!message.text.includes("\r"));
  assert.ok(!message.text.includes("Compte\n"));
  assert.ok(message.text.length < 1000);
});
