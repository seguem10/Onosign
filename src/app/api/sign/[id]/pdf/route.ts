import { verifyStoredPdf } from "@/lib/server/pdf-integrity";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

function denied(status = 404) {
  return NextResponse.json(
    { message: "Document indisponible pour ce signataire." },
    { status, headers: noStore }
  );
}

type PdfInfo = {
  document_id: string;
  storage_path: string;
  original_sha256: string;
};

/**
 * Stream the existing original PDF to a verified, designated signer.
 * Both the RPC and Supabase Storage RLS independently authorize access.
 * A draft document can never be downloaded through this endpoint.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) return denied(400);

  try {
    const supabase = await createServerSupabaseClient();
    const { data: userResult, error: authError } = await supabase.auth.getUser();
    if (authError || !userResult.user) return denied(401);
    const { data, error: lookupError } = await supabase.rpc(
      "onosign_signer_pdf_info", { p_document_id: id }
    );
    if (lookupError || !data || typeof data !== "object") return denied();
    const info = data as PdfInfo;
    if (info.document_id !== id ||
        typeof info.storage_path !== "string" ||
        !/^[a-f0-9]{64}$/i.test(info.original_sha256)) return denied();

    const { data: pdf, error: storageError } = await supabase.storage
      .from("documents")
      .download(info.storage_path);
    if (storageError || !pdf || pdf.size < 5 || pdf.size > 20 * 1024 * 1024) {
      return denied();
    }

    const bytes = Buffer.from(await pdf.arrayBuffer());
    const integrity = verifyStoredPdf(bytes, info.original_sha256);
    if (!integrity.verified) {
      return NextResponse.json(
        { message: "Intégrité du PDF non vérifiée : téléchargement bloqué." },
        { status: 409, headers: noStore }
      );
    }
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        ...noStore,
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="onosign-original.pdf"',
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy": "frame-ancestors 'self'",
      },
    });
  } catch {
    return denied(503);
  }
}
