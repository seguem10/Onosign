import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type ArchiveInfo = {
  document_id: string;
  sha256: string;
  evidence_sha256: string;
  byte_size: number;
  signature_count: number;
  finalized_at: string;
};

export default async function DocumentArchivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect("/");

  const validId = /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id);
  const { data, error } = validId
    ? await supabase.rpc("onosign_final_artifact_info", { p_document_id: id })
    : { data: null, error: new Error("Document indisponible.") };
  const artifact = !error && data && typeof data === "object"
    ? data as ArchiveInfo
    : null;

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <Link href="/dashboard" className="text-sm font-semibold text-emerald-700">
          ← Tableau de bord
        </Link>
        <header className="mt-7 rounded-2xl bg-slate-950 p-7 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">
            OnoSign · ONOMO HOTELS
          </p>
          <h1 className="mt-3 text-3xl font-bold">Archive du document signé</h1>
          <p className="mt-2 text-sm text-slate-300">
            Consultez les métadonnées du PDF final conservé en espace privé.
          </p>
        </header>
        {!artifact ? (
          <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="font-bold text-amber-950">Archive indisponible</h2>
            <p className="mt-2 text-sm text-amber-900">
              Aucun PDF final terminé et autorisé n&apos;est disponible pour ce compte.
              Le document peut encore être en préparation, ne pas avoir été signé
              ou ne pas être accessible à votre adresse vérifiée.
            </p>
          </section>
        ) : (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">Archive enregistrée</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="font-semibold text-slate-600">Finalisé le</dt>
                <dd className="mt-1">{new Date(artifact.finalized_at).toLocaleString("fr-FR")}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-600">Nombre de signatures</dt>
                <dd className="mt-1">{artifact.signature_count}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-600">Taille du PDF</dt>
                <dd className="mt-1">{(artifact.byte_size / 1024).toFixed(1)} Ko</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-600">Empreinte SHA-256 du PDF final</dt>
                <dd className="mt-1 break-all rounded-lg bg-slate-50 p-3 font-mono text-xs">
                  {artifact.sha256}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-600">Empreinte technique de la preuve</dt>
                <dd className="mt-1 break-all rounded-lg bg-slate-50 p-3 font-mono text-xs">
                  {artifact.evidence_sha256}
                </dd>
              </div>
            </dl>
            <a href={`/api/documents/${encodeURIComponent(id)}/final`}
              className="mt-7 inline-flex rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700">
              Télécharger le PDF final vérifié
            </a>
            <p className="mt-4 text-xs text-slate-500">
              L&apos;empreinte est recalculée côté serveur avant chaque téléchargement.
              Les métadonnées techniques ne constituent pas, à elles seules,
              un certificat juridique de signature électronique.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
