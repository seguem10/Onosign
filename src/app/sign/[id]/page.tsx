import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type SignerTask = {
  title: string;
  document_type: "DI" | "DR";
  document_status: string;
  recipient_name: string;
  role_label: string | null;
  signing_order: number;
  recipient_status: string;
  expires_at: string | null;
  eligible_to_sign: boolean;
  signing_enabled: false;
};

export default async function SignerTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect("/");

  const validId = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
  const response = validId
    ? await supabase.rpc("onosign_signer_task", { p_document_id: id })
    : { data: null, error: new Error("Invalid ID") };
  const task = !response.error && response.data
    ? response.data as SignerTask
    : null;

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <Link href="/dashboard" className="text-sm font-medium text-emerald-700">
          ← OnoSign
        </Link>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            ONOMO HOTELS · OnoSign
          </p>
          <h1 className="mt-2 text-2xl font-bold">Votre document à signer</h1>
          {!task ? (
            <div role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              Aucun document à signer n&apos;est disponible pour cette session.
              Assurez-vous de vous connecter avec l&apos;adresse e-mail vérifiée
              du destinataire et que le document a été réellement envoyé.
            </div>
          ) : (
            <>
              <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                <div><dt className="text-slate-500">Document</dt><dd className="font-semibold">{task.title}</dd></div>
                <div><dt className="text-slate-500">Type</dt><dd className="font-semibold">{task.document_type}</dd></div>
                <div><dt className="text-slate-500">Signataire</dt><dd className="font-semibold">{task.recipient_name}</dd></div>
                <div><dt className="text-slate-500">Fonction</dt><dd className="font-semibold">{task.role_label ?? "Signataire"}</dd></div>
                <div><dt className="text-slate-500">Ordre</dt><dd className="font-semibold">{task.signing_order}</dd></div>
                <div><dt className="text-slate-500">Statut</dt><dd className="font-semibold">{task.recipient_status}</dd></div>
              </dl>
              <section className="mt-7 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-slate-900">Document original</h2>
                  <a
                    href={`/api/sign/${encodeURIComponent(id)}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-emerald-600 px-3 py-2 text-xs font-semibold text-emerald-800"
                  >
                    Ouvrir le PDF ↗
                  </a>
                </div>
                <iframe
                  title="Document original à vérifier avant signature"
                  src={`/api/sign/${encodeURIComponent(id)}/pdf`}
                  className="h-[620px] w-full rounded-lg border border-slate-200 bg-white"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Le PDF est accessible uniquement depuis le compte vérifié du destinataire,
                  après envoi autorisé. Son empreinte SHA-256 est vérifiée côté serveur.
                </p>
              </section>

              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <strong>Signature non disponible.</strong> L&apos;identité du compte et
                le circuit peuvent être contrôlés, mais l&apos;envoi et la capture
                de signature sont volontairement bloqués avant leur validation.
              </div>
            </>
          )}
          <p className="mt-6 text-xs text-slate-500">
            Ce portail ne contient actuellement ni champ de signature activé,
            ni document signé, ni certificat électronique.
          </p>
        </div>
      </div>
    </main>
  );
}
