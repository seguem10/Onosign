"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Workspace = {
  id: string;
  name: string;
  type: "hotel" | "head_office" | "head_office_department" | "sarh";
  country_code: string | null;
};
type DocumentRow = {
  id: string;
  title: string;
  status: string;
  document_type: string | null;
  created_at: string;
  workspace_id: string;
};
type Counters = { documents: number; sent: number; completed: number; tasks: number };

const pill: Record<string, string> = {
  draft: "Brouillon", sent: "Envoyé", viewed: "Consulté",
  partially_signed: "Signature en cours", completed: "Terminé",
  declined: "Refusé", expired: "Expiré", cancelled: "Annulé",
};

export default function DashboardPage() {
  const router = useRouter();
  const [userName, setUserName] = useState("Collaborateur");
  const [organizationName, setOrganizationName] = useState("ONOMO HOTELS");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [counters, setCounters] = useState<Counters>({ documents: 0, sent: 0, completed: 0, tasks: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const supabase = createClient();
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user) { router.replace("/"); return; }
        const user = auth.user;
        const [profile, membership, hotelMembers] = await Promise.all([
          supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
          supabase.from("organization_members").select("organization_id").eq("user_id", user.id).maybeSingle(),
          supabase.from("workspace_members").select("workspace_id").eq("user_id", user.id),
        ]);
        if (!active) return;
        if (membership.error || !membership.data) { router.replace("/onboarding"); return; }
        if (hotelMembers.error) throw new Error("Impossible de charger les droits d'accès aux établissements.");
        setUserName(profile.data?.full_name || user.user_metadata?.full_name || user.email || "Collaborateur");
        const ids = [...new Set((hotelMembers.data ?? []).map((row) => row.workspace_id))];
        const [organization, workspaceResult, recent, countAll, countSent, countCompleted, tasks] = await Promise.all([
          supabase.from("organizations").select("name").eq("id", membership.data.organization_id).maybeSingle(),
          ids.length > 0
            ? supabase.from("workspaces").select("id,name,type,country_code").eq("organization_id", membership.data.organization_id).in("id", ids).order("name")
            : Promise.resolve({ data: [] as Workspace[], error: null }),
          supabase.from("documents").select("id,title,status,document_type,created_at,workspace_id")
            .eq("created_by", user.id).order("created_at", { ascending: false }).limit(8),
          supabase.from("documents").select("id", { count: "exact", head: true }).eq("created_by", user.id),
          supabase.from("documents").select("id", { count: "exact", head: true }).eq("created_by", user.id)
            .in("status", ["sent", "viewed", "partially_signed"]),
          supabase.from("documents").select("id", { count: "exact", head: true }).eq("created_by", user.id)
            .eq("status", "completed"),
          supabase.rpc("onosign_my_signature_tasks"),
        ]);
        if (!active) return;
        if (workspaceResult.error || recent.error || countAll.error || countSent.error || countCompleted.error || tasks.error) {
          throw new Error("Impossible de charger le tableau de bord. Vérifiez votre session et vos autorisations.");
        }
        setOrganizationName(organization.data?.name ?? "ONOMO HOTELS");
        const allowed = (workspaceResult.data ?? []) as Workspace[];
        setWorkspaces(allowed);
        const saved = window.localStorage.getItem("onosign_active_workspace");
        const selected = allowed.some((w) => w.id === saved) ? saved! : (allowed[0]?.id ?? "");
        setActiveWorkspaceId(selected);
        if (selected) window.localStorage.setItem("onosign_active_workspace", selected);
        else window.localStorage.removeItem("onosign_active_workspace");
        setDocuments((recent.data ?? []) as DocumentRow[]);
        setCounters({
          documents: countAll.count ?? 0,
          sent: countSent.count ?? 0,
          completed: countCompleted.count ?? 0,
          tasks: (tasks.data ?? []).length,
        });
      } catch (exception) {
        if (active) setError(exception instanceof Error ? exception.message : "Erreur lors du chargement.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [router]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  const activeWorkspace = workspaces.find((item) => item.id === activeWorkspaceId);
  if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">Chargement d&apos;OnoSign…</main>;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 lg:flex">
      <aside className="bg-slate-950 p-6 text-white lg:flex lg:w-64 lg:flex-col">
        <div className="text-2xl font-bold">Ono<span className="text-emerald-400">Sign</span></div>
        <nav className="mt-6 flex flex-wrap gap-2 text-sm lg:mt-12 lg:flex-col" aria-label="Navigation principale">
          <Link href="/dashboard" aria-current="page" className="rounded-xl bg-slate-800 px-4 py-3 font-semibold">Tableau de bord</Link>
          <Link href="/documents/new" className="rounded-xl px-4 py-3 text-slate-300 hover:bg-slate-900">Nouveau document</Link>
          <Link href="/sign" className="rounded-xl px-4 py-3 text-slate-300 hover:bg-slate-900">Mes signatures</Link>
          <Link href="/notifications" className="rounded-xl px-4 py-3 text-slate-300 hover:bg-slate-900">Notifications</Link>
          <Link href="/templates" className="rounded-xl px-4 py-3 text-slate-300 hover:bg-slate-900">Modèles</Link>
          <Link href="/admin" className="rounded-xl px-4 py-3 text-slate-300 hover:bg-slate-900">Administration</Link>
        </nav>
        <div className="mt-6 border-t border-slate-800 pt-5 lg:mt-auto">
          <p className="truncate text-sm text-slate-300">{organizationName}</p>
          <button type="button" onClick={() => void signOut()} className="mt-3 text-sm text-slate-400 hover:text-white">
            Déconnexion
          </button>
        </div>
      </aside>
      <section className="min-w-0 flex-1">
        <header className="border-b border-slate-200 bg-white px-5 py-5 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">{organizationName}</p>
              <h1 className="text-xl font-bold">Tableau de bord</h1>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold">{userName}</p>
              <p className="text-xs text-slate-500">Compte OnoSign</p>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-7xl p-5 lg:p-8">
          {error && <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold">Bienvenue</h2>
              <p className="mt-2 text-sm text-slate-500">Vos documents, demandes et circuits de signature ONOMO.</p>
            </div>
            <Link href="/documents/new" aria-disabled={workspaces.length === 0}
              className={`rounded-xl px-5 py-3 text-sm font-semibold text-white ${workspaces.length === 0 ? "pointer-events-none bg-slate-400" : "bg-emerald-600 hover:bg-emerald-700"}`}>
              + Nouveau document
            </Link>
          </div>
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <label htmlFor="active-workspace" className="text-sm font-semibold text-slate-700">Établissement actif</label>
            {workspaces.length ? (
              <select id="active-workspace" className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm sm:max-w-lg"
                value={activeWorkspaceId}
                onChange={(event) => {
                  const id = event.target.value;
                  if (!workspaces.some((w) => w.id === id)) return;
                  setActiveWorkspaceId(id);
                  window.localStorage.setItem("onosign_active_workspace", id);
                }}>
                {workspaces.map((w) => <option key={w.id} value={w.id}>{w.type === "hotel" ? "🏨 " : "🏢 "}{w.name}</option>)}
              </select>
            ) : <p className="mt-2 text-sm text-amber-800">
              Aucun établissement ne vous est attribué. Contactez votre administrateur ONOMO avant de créer un document.
            </p>}
            {activeWorkspace && <p className="mt-2 text-xs text-emerald-700">Accès confirmé : {activeWorkspace.name}</p>}
          </section>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Mes documents" value={counters.documents} />
            <StatCard title="En cours d'envoi ou signature" value={counters.sent} />
            <StatCard title="Terminés" value={counters.completed} />
            <StatCard title="Mes signatures à traiter" value={counters.tasks} />
          </div>
          <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-6">
              <div>
                <h2 className="text-lg font-bold">Documents récents</h2>
                <p className="mt-1 text-sm text-slate-500">Uniquement les documents créés par votre compte.</p>
              </div>
              <Link className="text-sm font-semibold text-emerald-700 hover:underline" href="/sign">Mes signatures →</Link>
            </div>
            {documents.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-4xl" aria-hidden="true">📄</p>
                <h3 className="mt-4 font-bold">Aucun document créé</h3>
                <p className="mt-2 text-sm text-slate-500">Créez un brouillon DI ou DR pour préparer le circuit de signature.</p>
              </div>
            ) : <ul className="divide-y divide-slate-100">
              {documents.map((doc) => <li key={doc.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
                <div>
                  <p className="font-semibold">{doc.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {doc.document_type ?? "Document"} · {new Date(doc.created_at).toLocaleDateString("fr-FR")} · {pill[doc.status] ?? doc.status}
                  </p>
                </div>
                <Link
                  href={doc.status === "completed"
                    ? `/documents/${doc.id}/archive`
                    : `/documents/${doc.id}/prepare`}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                >
                  {doc.status === "completed" ? "Archive signée" : "Consulter"}
                </Link>
              </li>)}
            </ul>}
          </section>
          <p className="mt-5 text-xs text-slate-500">Les modèles DI/DR restent en validation. Les invitations et signatures réelles ne sont pas encore activées.</p>
        </div>
      </section>
    </main>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-6">
    <p className="text-sm text-slate-500">{title}</p>
    <p className="mt-3 text-3xl font-bold">{value}</p>
  </div>;
}
