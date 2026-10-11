import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };
function errorResponse(message: string, status: number) {
  return NextResponse.json({ message }, { status, headers: noStore });
}

type AuditRow = {
  id: number;
  event_type: string;
  actor_id: string | null;
  recipient_id: string | null;
  previous_status: string | null;
  next_status: string | null;
  source_sha256: string | null;
  occurred_at: string;
};

/**
 * Operational audit export for the verified creator within the same hotel.
 * The SHA-256 checksum detects accidental export alteration; this is NOT
 * a signed evidence certificate and does not attest signer identity.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
    return errorResponse("Identifiant invalide.", 400);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return errorResponse("Connexion requise.", 401);

    const { data: doc, error: documentError } = await supabase.from("documents")
      .select("id,title,document_type,amount_eur,status,workspace_id,organization_id,created_by,original_sha256,final_sha256,created_at,updated_at")
      .eq("id", id).maybeSingle();
    if (documentError || !doc || doc.created_by !== auth.user.id) {
      return errorResponse("Document inaccessible.", 404);
    }

    const { data: member, error: memberError } = await supabase
      .from("workspace_members").select("user_id")
      .eq("user_id", auth.user.id).eq("workspace_id", doc.workspace_id).maybeSingle();
    if (memberError || !member) return errorResponse("Accès hôtel refusé.", 403);

    // Request 5,001 to detect truncation; do not export silently incomplete evidence.
    const { data: events, error: eventsError } = await supabase
      .from("onosign_document_audit")
      .select("id,event_type,actor_id,recipient_id,previous_status,next_status,source_sha256,occurred_at")
      .eq("document_id", id).order("id", { ascending: true }).limit(5001);
    if (eventsError) return errorResponse("Historique indisponible.", 500);
    if ((events?.length ?? 0) > 5000) {
      return errorResponse("Historique trop volumineux pour cet export. Contactez l'administrateur.", 413);
    }

    const payload = {
      format: "onosign-operational-audit-v1",
      disclaimer: "Journal technique uniquement : ni certificat de signature ni preuve d'identité du signataire.",
      document: {
        id: doc.id,
        title: doc.title,
        document_type: doc.document_type,
        amount_eur: doc.amount_eur,
        status: doc.status,
        organization_id: doc.organization_id,
        workspace_id: doc.workspace_id,
        created_by: doc.created_by,
        original_sha256: doc.original_sha256,
        final_sha256: doc.final_sha256,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
      },
      events: (events ?? []) as AuditRow[],
    };
    // The checksum covers the exact JSON payload and is reproducible.
    const payloadSha256 = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const exported = {
      ...payload,
      payload_sha256: payloadSha256,
      exported_at: new Date().toISOString(),
    };

    return new NextResponse(JSON.stringify(exported, null, 2), {
      status: 200,
      headers: {
        ...noStore,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="onosign-audit-${id}.json"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return errorResponse("Export indisponible.", 500);
  }
}
