import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type SignerTask = {
  document_id: string;
  document_title: string;
  document_type: string;
  recipient_id: string;
  role_label: string | null;
  signing_order: number;
  recipient_status: string;
  expires_at: string | null;
  eligible_to_sign: boolean;
  signing_enabled: boolean;
};

export default async function MySignaturesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect("/");

  const { data, error } = await supabase.rpc("onosign_my_signature_tasks");
  const tasks: SignerTask[] = error ? [] : (data ?? []) as SignerTask[];
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <Link href="/dashboard" className="text-sm font-semibold text-emerald-700">← Tableau de bord</Link>
        <header className="mt-7 rounded-2xl bg-slate-950 p-7 text-white">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">ONOMO HOTELS · OnoSign</p>
          <h1 className="mt-3 text-3xl font-bold">Mes signatures</h1>
          <p className="mt-2 text-sm text-slate-300">
            Les documents sont associés à l&apos;adresse e-mail vérifiée de votre compte.
            Les signatures et les invitations réelles restent désactivées pendant les tests.
          </p>
        </header>
        {error && <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Impossible de charger les demandes de signature. Réessayez ultérieurement.
        </div>}
        {!error && tasks.length === 0 && <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <div className="text-4xl" aria-hidden="true">✍️</div>
          <h2 className="mt-3 text-lg font-bold">Aucune signature en attente</h2>
          <p className="mt-2 text-sm text-slate-500">
            Aucune demande active ne correspond à votre compte vérifié. Les circuits DI/DR sont actuellement en phase de validation.
          </p>
        </div>}
        {tasks.length > 0 && <section className="mt-6 space-y-3" aria-label="Demandes reçues">
          {tasks.map((task) => (
            <article key={task.recipient_id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">{task.document_type}</span>
                  <h2 className="mt-2 text-lg font-bold">{task.document_title}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {task.role_label ?? "Signataire"} · Étape {task.signing_order} · {task.recipient_status}
                  </p>
                </div>
                <Link href={`/sign/${task.document_id}`}
                  className="rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">
                  Consulter
                </Link>
              </div>
              <p className="mt-3 text-xs text-amber-700">
                {task.eligible_to_sign ? "Votre tour dans le circuit — signature encore désactivée." : "En attente des conditions de signature."}
              </p>
            </article>
          ))}
        </section>}
      </div>
    </main>
  );
}
