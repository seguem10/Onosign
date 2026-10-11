import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
function failure(message: string, status: number) {
  return NextResponse.json({ verified: false, message }, { status, headers: noStore });
}

// Checks the original server-stored PDF against the digest captured at upload.
// Does not constitute a signature or certificate and never changes document state.
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return failure("Identifiant de document invalide.", 400);
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return failure("Authentification requise.", 401);

    const { data: doc, error: documentError } = await supabase
      .from("documents")
      .select("id,workspace_id,created_by,storage_path,original_sha256")
      .eq("id", id)
      .maybeSingle();
    if (documentError || !doc || doc.created_by !== auth.user.id) {
      return failure("Document indisponible.", 404);
    }

    const { data: member, error: memberError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", doc.workspace_id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (memberError || !member) return failure("Accès à l'établissement refusé.", 403);

    if (!doc.original_sha256 || !/^[a-f0-9]{64}$/i.test(doc.original_sha256)) {
      return failure("Empreinte originale absente : vérification impossible pour ce document.", 422);
    }

    // Check the expected storage folder, even if a permissive storage policy exists.
    if (!doc.storage_path.startsWith(`${doc.workspace_id}/${auth.user.id}/`)) {
      return failure("Chemin de stockage inattendu.", 409);
    }

    const { data: blob, error: downloadError } = await supabase.storage
      .from("documents")
      .download(doc.storage_path);
    if (downloadError || !blob) return failure("Lecture du PDF impossible.", 502);
    if (blob.size === 0 || blob.size > 20 * 1024 * 1024) {
      return failure("Taille du PDF incorrecte.", 422);
    }

    const actualSha256 = createHash("sha256")
      .update(Buffer.from(await blob.arrayBuffer()))
      .digest("hex");
    const verified = actualSha256.toLowerCase() === doc.original_sha256.toLowerCase();
    return NextResponse.json(
      { verified, message: verified ? "PDF original intact." : "Le PDF ne correspond plus à son empreinte initiale." },
      { status: verified ? 200 : 409, headers: noStore }
    );
  } catch {
    return failure("Impossible de vérifier l'intégrité du document.", 500);
  }
}
