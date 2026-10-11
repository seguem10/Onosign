import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type Hotel = {
  workspace_id: string;
  hotel_name: string;
  country_code: string | null;
  member_count: number;
  has_members: boolean;
};
type Model = {
  id: string;
  name: string;
  document_type: string;
  scope: string;
  is_active: boolean;
};

function ReadinessCard({ title, value, warning }: {
  title: string; value: string; warning?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-600">{title}</p>
      <p className={`mt-3 text-3xl font-bold ${warning ? "text-amber-700" : "text-slate-950"}`}>{value}</p>
    </div>
  );
}

export default async function AdminReadinessPage() {
  // Server-side admin authorization is enforced by /admin/layout.tsx.
  const supabase = await createServerSupabaseClient();
  const [hotelResult, blueprintResult, documentResult, deliveryResult] = await Promise.all([
    supabase.rpc("onosign_hotel_onboarding_status"),
    supabase.from("signature_blueprints")
      .select("id,name,document_type,scope,is_active").order("name"),
    supabase.from("documents")
      .select("id", { count: "exact", head: true })
      .in("document_type", ["DI", "DR"]),
    supabase.rpc("onosign_delivery_health"),
  ]);

  const error = hotelResult.error ?? blueprintResult.error ?? documentResult.error ?? deliveryResult.error;
  const delivery = (deliveryResult.data ?? {}) as { pending?: number; failed?: number; sent?: number; delivery_enabled?: boolean };
  const hotels = (hotelResult.data ?? []) as Hotel[];
  const models = (blueprintResult.data ?? []) as Model[];
  const memberless = hotels.filter((hotel) => !hotel.has_members);
  const inactive = models.filter((model) => !model.is_active);

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <Link className="text-sm font-semibold text-emerald-700" href="/admin">← Administration</Link>
        <header className="mt-7 rounded-2xl bg-slate-950 px-7 py-8 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">
            OnoSign · ONOMO HOTELS
          </p>
          <h1 className="mt-3 text-3xl font-bold">Préparation à la mise en service</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            Tableau de bord de configuration uniquement. L&apos;envoi réel des DI/DR est
            volontairement désactivé. Un modèle actif ou un hôtel avec des comptes
            ne constitue pas à lui seul une autorisation de signature.
          </p>
        </header>
        {error ? (
          <p role="alert" className="mt-7 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            Les contrôles de configuration ne sont pas disponibles. Aucun établissement
            ne doit être déclaré opérationnel sans vérification complète.
          </p>
        ) : (
          <>
            <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <ReadinessCard title="Hôtels au catalogue" value={String(hotels.length)} />
              <ReadinessCard title="Hôtels sans membre" value={String(memberless.length)} warning={memberless.length > 0} />
              <ReadinessCard title="Modèles DI/DR inactifs" value={String(inactive.length)} warning={inactive.length > 0} />
              <ReadinessCard title="Documents DI/DR visibles" value={String(documentResult.count ?? 0)} />
            </div>
            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-bold">État de la file des invitations</h2>
              <p className="mt-2 text-sm text-slate-600">Compteurs techniques de votre organisation ; aucune adresse e-mail ni aucun jeton ne sont affichés.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <ReadinessCard title="En attente" value={String(delivery.pending ?? 0)} />
                <ReadinessCard title="En échec" value={String(delivery.failed ?? 0)} warning={(delivery.failed ?? 0) > 0} />
                <ReadinessCard title="Marqués envoyés" value={String(delivery.sent ?? 0)} />
              </div>
              <p className="mt-3 text-xs font-semibold text-amber-800">Statut : envoi réel non autorisé. Ces données ne prouvent pas une livraison effective.</p>
            </section>
            <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6">
              <h2 className="text-lg font-bold text-amber-950">🚫 Signatures réelles non autorisées</h2>
              <p className="mt-2 text-sm leading-6 text-amber-900">
                Le moteur sécurisé d&apos;invitation, l&apos;identification finale des signataires,
                l&apos;apposition de signature, le PDF final, les preuves et l&apos;archivage
                ne sont pas validés de bout en bout. La protection de la base
                de données empêche l&apos;envoi d&apos;un circuit DI/DR.
              </p>
            </section>
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-bold">Affectation des hôtels</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Les comptes doivent déjà exister et être explicitement affectés par l&apos;administrateur.
                </p>
                <p className="mt-3 text-sm font-semibold">
                  {memberless.length} hôtel{memberless.length > 1 ? "s" : ""} sans collaborateurs
                </p>
                <Link href="/admin/hotels" className="mt-5 inline-flex rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
                  Contrôler les comptes →
                </Link>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-bold">Circuits financiers</h2>
                <p className="mt-2 text-sm text-slate-600">
                  DI : deux fondés de pouvoir dès 20 000 € inclus.
                  DR : service financier et un directeur, puis un second directeur au-delà de 20 000 €.
                </p>
                <div className="mt-4 space-y-2 text-sm">
                  {models.map((model) => (
                    <div key={model.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                      <span className="font-medium">{model.document_type} · {model.scope === "hotels" ? "Hôtels" : "Siège"}</span>
                      <span className={model.is_active ? "font-semibold text-emerald-800" : "font-semibold text-amber-800"}>
                        {model.is_active ? "Modèle actif, contrôles encore nécessaires" : "Inactif"}
                      </span>
                    </div>
                  ))}
                </div>
                <Link href="/admin/templates/workspaces" className="mt-5 inline-flex rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-800">
                  Vérifier les signataires par hôtel →
                </Link>
              </section>
            </div>
            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-bold">Conditions à valider avant la production</h2>
              <ol className="mt-4 list-inside list-decimal space-y-3 text-sm leading-6 text-slate-700">
                <li>Associer les vrais collaborateurs et leurs rôles à chaque hôtel et au siège.</li>
                <li>Valider les signataires DI/DR, les seuils et les règles conditionnelles avec le métier.</li>
                <li>Configurer une messagerie transactionnelle vérifiée, les invitations et leurs expirations.</li>
                <li>Tester une signature de bout en bout, y compris le PDF final et le journal des preuves.</li>
                <li>Tester les accès entre hôtels, les PDF confidentiels, les échecs et les reprises.</li>
                <li>Faire approuver la conformité et la politique d&apos;archivage avant toute ouverture.</li>
              </ol>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
