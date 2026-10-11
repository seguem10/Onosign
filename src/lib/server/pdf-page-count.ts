// This limit mirrors the 20 MiB storage bucket ceiling.
const MAX_ONOSIGN_PDF_BYTES = 20 * 1024 * 1024;

export const MAX_ONOSIGN_PDF_PAGES = 500;

export type PdfPageInfo = {
  pages: number;
};

/**
 * Parse the actual PDF page tree with PDF.js, not guessed /Page text matches.
 * Caller must check the stored SHA-256 against the actual bytes first.
 */
export async function readPdfPageCount(bytes: Uint8Array): Promise<PdfPageInfo> {
  if (bytes.byteLength < 5 || bytes.byteLength > MAX_ONOSIGN_PDF_BYTES) {
    throw new Error("PDF size outside permitted limits");
  }

  // Import only on Node server routes. Do not expose parsed PDF content.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: false,
    useWorkerFetch: false,
    stopAtErrors: true,
    verbosity: 0,
  });
  try {
    const document = await task.promise;
    const pages = document.numPages;
    if (!Number.isSafeInteger(pages) || pages < 1 ||
        pages > MAX_ONOSIGN_PDF_PAGES) {
      throw new Error("PDF page count outside permitted limits");
    }
    return { pages };
  } finally {
    await task.destroy();
  }
}
