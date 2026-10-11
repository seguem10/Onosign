import test from "node:test";
import assert from "node:assert/strict";
import { readPdfPageCount } from "../src/lib/server/pdf-page-count.ts";

function minimalBlankPdf() {
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources <<>> /Contents 4 0 R >>\nendobj\n",
    "4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n",
  ];
  let text = "%PDF-1.4\n";
  const positions = [0];
  for (const object of objects) {
    positions.push(Buffer.byteLength(text, "ascii"));
    text += object;
  }
  const xrefAt = Buffer.byteLength(text, "ascii");
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of positions.slice(1)) {
    text += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(text, "ascii");
}

test("PDF.js counts the real pages in a valid one-page PDF", async () => {
  assert.deepEqual(await readPdfPageCount(minimalBlankPdf()), { pages: 1 });
});

test("PDF.js rejects malformed and non-PDF data", async () => {
  await assert.rejects(readPdfPageCount(Buffer.from("HELLO")), Error);
  await assert.rejects(readPdfPageCount(Buffer.from("%PDF-1.7\nnot-real")), Error);
});

test("large files are rejected before PDF parser allocation", async () => {
  await assert.rejects(readPdfPageCount(Buffer.alloc(20 * 1024 * 1024 + 1)), Error);
});
