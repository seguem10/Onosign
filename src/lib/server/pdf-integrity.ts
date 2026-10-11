import { createHash, timingSafeEqual } from "node:crypto";

export const MAX_ONOSIGN_PDF_BYTES = 20 * 1024 * 1024;

export type PdfVerification =
  | { verified: true; digest: string }
  | {
      verified: false;
      reason: "invalid_size" | "missing_fingerprint" | "not_a_pdf" | "digest_mismatch";
    };

/**
 * Byte-level checksum only. This does not validate PDF objects, digital
 * certificate chains, signer identity or legal signature evidence.
 */
export function verifyStoredPdf(
  bytes: Uint8Array,
  expectedSha256: string,
  declaredSize?: number
): PdfVerification {
  if (
    bytes.byteLength < 5 ||
    bytes.byteLength > MAX_ONOSIGN_PDF_BYTES ||
    (declaredSize !== undefined &&
      (!Number.isSafeInteger(declaredSize) || bytes.byteLength !== declaredSize))
  ) {
    return { verified: false, reason: "invalid_size" };
  }
  if (!/^[a-f0-9]{64}$/i.test(expectedSha256)) {
    return { verified: false, reason: "missing_fingerprint" };
  }
  if (Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") {
    return { verified: false, reason: "not_a_pdf" };
  }
  const actual = createHash("sha256").update(bytes).digest();
  const expected = Buffer.from(expectedSha256, "hex");
  if (!timingSafeEqual(actual, expected)) {
    return { verified: false, reason: "digest_mismatch" };
  }
  return { verified: true, digest: actual.toString("hex") };
}
