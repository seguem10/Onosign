"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Notification = {
  id: string;
  document_id: string;
  kind: "draft_created" | "ready_to_sign";
  title: string;
  created_at: string;
  read_at: string | null;
};

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const supabase = createClient();
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user) { router.replace("/"); return; }
        const { data, error: loadError } = await supabase
          .from("onosign_notifications")
          .select("id,document_id,kind,title,created_at,read_at")
          .order("created_at", { ascending: false })
          .limit(100);
        if (!active) return;
        if (loadError) throw new Error("Impossible de charger les notifications.");
        setItems((data ?? []) as Notification[]);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Erreur de chargement.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [router]);

  async function markRead(id: string) {
    if (working) return;
    setError("");
    setWorking(id);
    try {
      const now = new Date().toISOString();
      const supabase = createClient();
      const { error: updateError } = await supabase.from("onosign_notifications")
        .update({ read_at: now }).eq("id", id).is("read_at", null);
      if (updateError) throw updateError;
      setItems((current) => current.map((item) => item.id === id ? { ...item, read_at: now } : item));
    } catch {
      setError("Impossible de marquer la notification comme lue.");
    } finally {
      setWorking(null);
    }
  }

  const unread = items.filter((item) => !item.read_at).length;
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <Link href="/dashboard" className="text-sm font-semibold text-emerald-700">← Tableau de bord</Link>
        <div className="mt-7 rounded-2xl bg-slate-950 p-7 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">OnoSign · ONOMO HOTELS</p>
          <h1 className="mt-2 text-3xl font-bold">Mes notifications</h1>
          <p className="mt-2 text-sm text-slate-300">
            Alertes internes pour vos brouillons et futures demandes de signature.
            Ceci n&apos;envoie aucun e-mail.
          </p>
        </div>
        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="font-semibold">{unread} non lue{unread > 1 ? "s" : ""}</p>
          <Link href="/sign" className="text-sm font-semibold text-emerald-700 hover:underline">
            Mes signatures →
          </Link>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {loading ? <p className="mt-6 text-sm text-slate-500">Chargement…</p> :
          items.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-9 text-center">
              <h2 className="font-bold">Aucune notification</h2>
              <p className="mt-2 text-sm text-slate-500">Votre activité OnoSign apparaîtra ici.</p>
            </div>
          ) : <ul className="mt-6 space-y-3">
            {items.map((item) => (
              <li key={item.id} className={`rounded-xl border p-5 shadow-sm ${item.read_at ? "border-slate-200 bg-white" : "border-emerald-200 bg-emerald-50"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.kind === "draft_created" ? "Création de brouillon" : "Demande de signature"}
                      {" · "}{new Date(item.created_at).toLocaleString("fr-FR")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={item.kind === "ready_to_sign" ? `/sign/${item.document_id}` : `/documents/${item.document_id}/prepare`}
                      className="rounded-lg border border-emerald-600 px-3 py-2 text-xs font-semibold text-emerald-800">
                      Consulter
                    </Link>
                    {!item.read_at && (
                      <button type="button" onClick={() => void markRead(item.id)} disabled={working !== null}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">
                        {working === item.id ? "Enregistrement…" : "Marquer comme lue"}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>}
      </div>
    </main>
  );
}
