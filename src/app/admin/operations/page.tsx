import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type DeliveryHealth = {
  pending: number;
  failed: number;
  sent: number;
  delivery_enabled: boolean;
  verified_at: string;
};
type ArchiveHealth = {
  completed_documents: number;
  registered_artifacts: number;
  missing_archives: number;
  final_bucket_private: boolean;
  archive_processing_enabled: boolean;
  verified_at: string;
};

function Stat({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className={`mt-2 text-3xl font-bold ${warning ? "text-amber-700" : "text-slate-950"}`}>
        {value}
      </dd>
    </div>
  );
}

export default async function OperationsPage() {
  // /admin/layout.tsx already requires central owner/admin authorization.
  // Both RPCs ALSO validate the logged-in admin on the database server.
  const supabase = await createServerSupabaseClient();
  const [delivery, archive] = await Promise.all([
    supabase.rpc("onosign_delivery_health"),
    supabase.rpc("onosign_archive_health"),
  ]);
  const d = delivery.error || !delivery.data ? null : (delivery.data as DeliveryHealth);
  const a = archive.error || !archive.data ? null : (archive.data as ArchiveHealth);
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="text-sm font-semibold text-emerald-700">← Administration</Link>
        <header className="mt-7 rounded-2xl bg-slate-950 p-7 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">ONOMO HOTELS · OnoSign</p>
          <h1 className="mt-2 text-3xl font-bold">Supervision de la signature</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            État technique des notifications par e-mail et des archives finales.
            Ce tableau est une lecture des indicateurs de la base de données,
            pas une preuve de livraison ou de signature.
          </p>
        </header>
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Livraison des invitations</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${d?.delivery_enabled ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
              {d?.delivery_enabled ? "Livraison activée" : "Livraison non activée"}
            </span>
          </div>
          {!d ? (
            <p role="alert" className="mt-4 text-sm text-red-700">Impossible de récupérer l&apos;état de livraison. Aucun statut positif ne peut être confirmé.</p>
          ) : (
            <>
              <dl className="mt-5 grid gap-4 sm:grid-cols-3">
                <Stat label="En attente / nouvelle tentative" value={d.pending} warning={d.pending > 0} />
                <Stat label="Exige une intervention" value={d.failed} warning={d.failed > 0} />
                <Stat label="Déclarés livrés" value={d.sent} />
              </dl>
              <p className="mt-4 text-xs text-slate-500">Dernier relevé : {new Date(d.verified_at).toLocaleString("fr-FR")}</p>
            </>
          )}
        </section>
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Archivage des PDF finaux</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${a?.final_bucket_private ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`}>
              {a?.final_bucket_private ? "Espace de stockage privé" : "Stockage privé non vérifié"}
            </span>
          </div>
          {!a ? (
            <p role="alert" className="mt-4 text-sm text-red-700">Impossible de vérifier l&apos;archivage. Ne considérez aucun document comme archivé.</p>
          ) : (
            <>
              <dl className="mt-5 grid gap-4 sm:grid-cols-3">
                <Stat label="Documents terminés" value={a.completed_documents} />
                <Stat label="PDF archivés" value={a.registered_artifacts} />
                <Stat label="Archives manquantes" value={a.missing_archives} warning={a.missing_archives > 0} />
              </dl>
              <p className="mt-4 text-xs text-slate-500">Traitement automatique : {a.archive_processing_enabled ? "actif" : "non activé"}. Relevé : {new Date(a.verified_at).toLocaleString("fr-FR")}.</p>
            </>
          )}
        </section>
        <aside className="mt-7 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          L&apos;envoi et la signature en production restent bloqués tant que
          la livraison, le circuit des signataires, la création du PDF final et
          les tests d&apos;intégration ne sont pas validés.
        </aside>
      </div>
    </main>
  );
}
