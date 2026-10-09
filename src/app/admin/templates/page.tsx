"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type TemplateRow = {
  id: string;
  name: string;
  document_type: string;
  description: string | null;
  workspace_id: string;
  is_active: boolean;
  workspaces: { name: string } | { name: string }[] | null;
  workflow_steps: {
    id: string;
    step_order: number;
    role_label: string;
    recipient_type: string;
    is_requester: boolean;
    is_required: boolean;
  }[];
};

export default function AdminTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const supabase = createClient();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !auth.user) {
        router.replace("/");
        return;
      }

      // The admin layout enforces owner/admin access on the server.
      // RLS still determines which rows the current user may read.
      const { data, error: queryError } = await supabase
        .from("workflow_templates")
        .select(`id, name, document_type, description, workspace_id, is_active,
          workspaces(name),
          workflow_steps(id, step_order, role_label, recipient_type, is_requester, is_required)`)
        .order("name");

      if (!active) return;
      if (queryError) setError(queryError.message);
      else setTemplates((data ?? []) as TemplateRow[]);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [router]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <button type="button" onClick={() => router.push("/admin")}
          className="text-sm font-medium text-slate-600 hover:text-slate-900">
          ← Administration
        </button>
        <div className="mt-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald-600">OnoSign · Administration</p>
            <h1 className="mt-2 text-3xl font-bold">Modèles DI / DR</h1>
            <p className="mt-2 text-slate-600">Consultez les circuits existants et leurs signataires, par établissement.</p>
          </div>
          <button type="button" onClick={() => router.push("/admin/templates/new")}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
            + Configurer un circuit
          </button>
        </div>

        {loading ? <p className="mt-8">Chargement des modèles…</p>
          : error ? <div role="alert" className="mt-8 rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">{error}</div>
          : templates.length === 0 ? (
            <div className="mt-8 rounded-xl border border-slate-200 bg-white p-8">
              Aucun modèle visible pour votre compte. Les règles Supabase RLS peuvent limiter les résultats par établissement.
            </div>
          ) : (
            <div className="mt-8 grid gap-5 md:grid-cols-2">
              {templates.map((template) => {
                const workspace = Array.isArray(template.workspaces)
                  ? template.workspaces[0] : template.workspaces;
                const steps = [...(template.workflow_steps ?? [])].sort(
                  (a, b) => a.step_order - b.step_order
                );
                return (
                  <article key={template.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                        {template.document_type}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${template.is_active
                        ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600"}`}>
                        {template.is_active ? "Actif" : "Inactif"}
                      </span>
                    </div>
                    <h2 className="mt-4 text-xl font-bold">{template.name}</h2>
                    <p className="mt-1 text-sm text-slate-500">{template.description || "Sans description"}</p>
                    <p className="mt-4 text-sm font-semibold text-slate-700">
                      Établissement : {workspace?.name ?? "Non disponible"}
                    </p>
                    <div className="mt-5 border-t border-slate-100 pt-4">
                      <p className="mb-3 text-sm font-semibold">Circuit de signature</p>
                      {steps.length === 0 ? <p className="text-sm text-slate-500">Aucune étape configurée.</p> : (
                        <ol className="space-y-2">
                          {steps.map((step) => (
                            <li key={step.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm">
                              <span>{step.step_order}. {step.role_label}</span>
                              <span className="text-xs text-slate-500">
                                {step.is_requester ? "Demandeur · " : ""}
                                {step.is_required ? "Obligatoire" : "Facultatif"}
                                {" · "}{step.recipient_type === "signer" ? "Signature" : step.recipient_type}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
      </div>
    </main>
  );
}
