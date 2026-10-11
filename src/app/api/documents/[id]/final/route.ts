import { verifyStoredPdf } from "@/lib/server/pdf-integrity";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const securityHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox",
};

type ArchivedPdf = {
  document_id: string;
  storage_path: string;
  sha256: string;
  byte_size: number;
  evidence_sha256: string;
};

function unavailable(status = 404) {
  return NextResponse.json(
    { message: "Aucun PDF final autorisé pour ce compte." },
    { status, headers: securityHeaders }
  );
}

/**
 * Provides the server-verified FINAL PDF, never the working or original PDF.
 * Only after an envelope is completed and its immutable record is registered.
 * Access is checked by the RPC and independently by Supabase Storage RLS.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) {
    return unavailable(400);
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return unavailable(401);

    const { data, error } = await supabase.rpc(
      "onosign_final_artifact_info",
      { p_document_id: id }
    );
    if (error || !data || typeof data !== "object") return unavailable();
    const info = data as ArchivedPdf;
    if (
      info.document_id !== id ||
      !/^[a-f0-9]{64}$/.test(info.sha256) ||
      !/^[a-f0-9]{64}$/.test(info.evidence_sha256) ||
      !Number.isSafeInteger(info.byte_size) ||
      info.byte_size < 5 ||
      info.byte_size > 20971520 ||
      !new RegExp(`^[a-f0-9-]{36}/[a-f0-9-]{36}/${id}/final\\.pdf$`, "i")
        .test(info.storage_path)
    ) return unavailable();

    const { data: pdf, error: fileError } = await supabase.storage
      .from("onosign-final-pdfs")
      .download(info.storage_path);
    if (fileError || !pdf || pdf.size !== info.byte_size) return unavailable();

    const bytes = Buffer.from(await pdf.arrayBuffer());
    const integrity = verifyStoredPdf(bytes, info.sha256, info.byte_size);
    if (!integrity.verified) {
      return NextResponse.json(
        { message: "Intégrité de l'archive PDF compromise : accès bloqué." },
        { status: 409, headers: securityHeaders }
      );
    }

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        ...securityHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="onosign-signed-final.pdf"',
        "Content-Length": String(bytes.length),
      },
    });
  } catch {
    return unavailable(503);
  }
}
