import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noCache = { "Cache-Control": "private, no-store" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400, headers: noCache });
  }
  try {
    const supabase = await createServerSupabaseClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401, headers: noCache });
    }
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("id,organization_id,workspace_id,created_by,title,created_at,status,document_type,amount_eur,storage_path,original_sha256,final_sha256")
      .eq("id", id).maybeSingle();
    if (docError || !doc || doc.created_by !== auth.user.id) {
      return NextResponse.json({ error: "Document introuvable." }, { status: 404, headers: noCache });
    }
    const { data: membership, error: memberError } = await supabase
      .from("workspace_members").select("workspace_id")
      .eq("workspace_id", doc.workspace_id).eq("user_id", auth.user.id).maybeSingle();
    if (memberError || !membership) {
      return NextResponse.json({ error: "Accès à l'établissement refusé." }, { status: 403, headers: noCache });
    }

    // The source hash is checked against the actual stored PDF, not merely
    // echoed from the database. This report is informational, not legal proof.
    let originalIntegrity: "verified" | "failed" | "unavailable" = "unavailable";
    if (doc.original_sha256 && /^[a-f0-9]{64}$/i.test(doc.original_sha256)
      && doc.storage_path.startsWith(`${doc.workspace_id}/${doc.created_by}/`)) {
      const { data: pdf, error: downloadError } = await supabase.storage
        .from("documents").download(doc.storage_path);
      if (!downloadError && pdf && pdf.size > 0 && pdf.size <= 20 * 1024 * 1024) {
        const actual = createHash("sha256").update(Buffer.from(await pdf.arrayBuffer())).digest("hex");
        originalIntegrity = actual === doc.original_sha256.toLowerCase() ? "verified" : "failed";
      }
    }

    const [{ data: events, count: totalEvents, error: eventsError }, { data: recipientData, error: recipientsError }, { data: auditChain, error: auditChainError }] = await Promise.all([
      supabase.from("onosign_document_audit")
        .select("id,chain_sequence,previous_hash,entry_hash,event_type,actor_id,recipient_id,previous_status,next_status,occurred_at,source_sha256", { count: "exact" })
        .eq("document_id", id).order("chain_sequence", { ascending: true }).range(0, 999),
      supabase.from("recipients")
        .select("id,role_label,recipient_type,signing_order,status,signed_at")
        .eq("document_id", id).order("signing_order"),
      supabase.rpc("onosign_verify_document_audit", { p_document_id: id }),
    ]);
    if (eventsError || recipientsError || auditChainError) {
      return NextResponse.json({ error: "Historique indisponible." }, { status: 503, headers: noCache });
    }

    const payload = {
      format: "onosign-technical-audit-v1",
      legalEvidenceCertificate: false,
      generatedAt: new Date().toISOString(),
      limitations: [
        "Journal technique non signé cryptographiquement.",
        "Ne prouve ni l'identité civile ni le consentement du signataire.",
        "Les évènements antérieurs à la création du journal ne sont pas reconstitués.",
        "Les modifications administrateur de la base restent hors de cette preuve.",
      ],
      document: {
        id: doc.id,
        title: doc.title,
        organization_id: doc.organization_id,
        workspace_id: doc.workspace_id,
        created_at: doc.created_at,
        status: doc.status,
        document_type: doc.document_type,
        amount_eur: doc.amount_eur,
        original_sha256: doc.original_sha256,
        original_integrity: originalIntegrity,
        final_sha256: doc.final_sha256,
      },
      recipients: recipientData ?? [],
      auditChain: auditChain ?? {
        chain_valid: false,
        event_count: 0,
        attestation_type: "untrusted_technical_hash_chain",
      },
      events: events ?? [],
      auditEventsTotal: totalEvents ?? (events?.length ?? 0),
      eventsComplete: (totalEvents ?? 0) <= (events?.length ?? 0),
    };
    // The digest detects accidental edits of this export; it is NOT a trusted
    // cryptographic attestation or electronic-signature certificate.
    const sha256 = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const report = JSON.stringify({ ...payload, export_payload_sha256: sha256 }, null, 2);
    return new NextResponse(report, {
      status: 200,
      headers: {
        ...noCache,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="onosign-audit-${id}.json"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Export impossible." }, { status: 500, headers: noCache });
  }
}
