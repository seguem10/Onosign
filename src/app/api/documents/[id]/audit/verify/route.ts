import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

/** Read-only integrity check: hash linkage does not attest signer identity. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ message: "Identifiant invalide." }, { status: 400, headers });
  }
  try {
    const supabase = await createServerSupabaseClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      return NextResponse.json({ message: "Authentification requise." }, { status: 401, headers });
    }
    // The RPC checks original document creator and hotel membership.
    const { data, error } = await supabase.rpc(
      "onosign_verify_document_audit", { p_document_id: id }
    );
    if (error || !data) {
      return NextResponse.json({ message: "Historique indisponible." }, { status: 404, headers });
    }
    return NextResponse.json({
      ...data,
      disclaimer: "Chaîne SHA-256 technique : ne constitue ni certificat signé ni attestation d'identité.",
    }, { status: 200, headers });
  } catch {
    return NextResponse.json({ message: "Vérification indisponible." }, { status: 503, headers });
  }
}
