import { verifyStoredPdf } from "@/lib/server/pdf-integrity";
import { readPdfPageCount } from "@/lib/server/pdf-page-count";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Preflight = {
  ready_for_review: boolean;
  dispatch_authorized: boolean;
  issues: string[];
  recipients: number;
  mapped_recipients: number;
  required_power_signers: number;
  actual_power_signers: number;
  signers_missing_signature_fields: number;
};

const noStore = { "Cache-Control": "no-store" };
function fail(message: string, status: number) {
  return NextResponse.json({ message }, { status, headers: noStore });
}

/**
 * Server-owned review of an ONOMO draft. Checks the database workflow and
 * compares the actual original PDF bytes to the stored immutable digest.
 * Deliberately does not send invitations or authorize any signature.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
    return fail("Identifiant de document invalide.", 400);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return fail("Session expirée.", 401);

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("id,status,workspace_id,created_by,storage_path,original_sha256,signature_blueprint_id,document_type")
      .eq("id", id)
      .maybeSingle();
    if (docError || !doc || doc.created_by !== auth.user.id) {
      return fail("Document introuvable ou accès refusé.", 404);
    }
    const { data: membership, error: memberError } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", doc.workspace_id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (memberError || !membership) return fail("Accès à l'hôtel refusé.", 403);

    if (!doc.signature_blueprint_id || doc.status !== "draft") {
      return fail("La revue nécessite un document brouillon avec un modèle DI/DR.", 409);
    }
    const { data: check, error: checkError } = await supabase
      .rpc("onosign_blueprint_preflight", { p_document_id: id });
    if (checkError || !check) return fail("Contrôle du circuit indisponible.", 500);

    const preflight = check as Preflight;
    const issues = Array.isArray(preflight.issues) ? [...preflight.issues] : [];
    let pdfVerified = false;
    let pageCount: number | null = null;
    const expected = doc.original_sha256?.toLowerCase() ?? "";

    if (!/^[0-9a-f]{64}$/.test(expected)) {
      issues.push("original_pdf_missing_hash");
    } else if (!doc.storage_path.startsWith(`${doc.workspace_id}/${auth.user.id}/`)) {
      issues.push("original_pdf_invalid_path");
    } else {
      const { data: file, error: downloadError } = await supabase.storage
        .from("documents")
        .download(doc.storage_path);
      if (downloadError || !file || file.size === 0 || file.size > 20 * 1024 * 1024) {
        issues.push("original_pdf_unavailable");
      } else {
        const bytes = Buffer.from(await file.arrayBuffer());
        const integrity = verifyStoredPdf(bytes, expected);
        pdfVerified = integrity.verified;
        if (!integrity.verified) {
          issues.push(integrity.reason === "not_a_pdf"
            ? "original_pdf_invalid_format" : "original_pdf_mismatch");
        } else {
          try {
            pageCount = (await readPdfPageCount(bytes)).pages;
          } catch {
            issues.push("original_pdf_invalid_structure");
          }
        }
      }
    }

    if (pageCount !== null) {
      const { data: placedFields, error: fieldsError } = await supabase
        .from("signature_fields")
        .select("page_number")
        .eq("document_id", doc.id);
      if (fieldsError) {
        issues.push("signature_fields_unavailable");
      } else if ((placedFields ?? []).some((field) =>
        !Number.isInteger(field.page_number) ||
        field.page_number < 1 || field.page_number > pageCount!
      )) {
        issues.push("signature_field_out_of_pdf_range");
      }
    }

    return NextResponse.json({
      ...preflight,
      issues,
      ready_for_review: preflight.ready_for_review && pdfVerified && issues.length === 0,
      pdf_integrity_verified: pdfVerified,
      pdf_page_count: pageCount,
      dispatch_authorized: false,
      // Never expose internal storage paths or raw original hash in the review.
    }, { headers: noStore });
  } catch {
    return fail("Vérification serveur indisponible.", 500);
  }
}
