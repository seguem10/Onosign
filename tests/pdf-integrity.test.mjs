import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { verifyStoredPdf } from "../src/lib/server/pdf-integrity.ts";

const sample = Buffer.from("%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n%%EOF");
const digest = createHash("sha256").update(sample).digest("hex");

test("stored original and signed final bytes match their immutable SHA256", () => {
  assert.deepEqual(verifyStoredPdf(sample, digest), {
    verified: true, digest,
  });
  assert.deepEqual(verifyStoredPdf(sample, digest.toUpperCase()), {
    verified: true, digest,
  });
});

test("a changed PDF with the same header is blocked", () => {
  const changed = Buffer.from(sample);
  changed[11] ^= 1;
  assert.deepEqual(verifyStoredPdf(changed, digest), {
    verified: false, reason: "digest_mismatch",
  });
});

test("invalid PDF input, malformed hashes and wrong byte length are blocked", () => {
  assert.deepEqual(verifyStoredPdf(Buffer.from("HELLO!"), digest), {
    verified: false, reason: "not_a_pdf",
  });
  assert.deepEqual(verifyStoredPdf(sample, "not-a-digest"), {
    verified: false, reason: "missing_fingerprint",
  });
  assert.deepEqual(verifyStoredPdf(sample, digest, sample.length + 1), {
    verified: false, reason: "invalid_size",
  });
  assert.deepEqual(verifyStoredPdf(Buffer.alloc(4), digest), {
    verified: false, reason: "invalid_size",
  });
});

test("oversized documents are rejected before hashing", () => {
  assert.deepEqual(verifyStoredPdf(Buffer.alloc(20 * 1024 * 1024 + 1), digest), {
    verified: false, reason: "invalid_size",
  });
});
