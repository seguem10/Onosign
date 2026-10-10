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

type BlueprintRow = {
  id: string;
  name: string;
  document_type: string;
  scope: string;
  is_active: boolean;
  financial_threshold_eur: number | null;
  signature_blueprint_steps: {
    id: string;
    step_order: number;
    role_label: string;
    recipient_type: string;
    is_required: boolean;
    condition_type: string;
    authorization_role: string;
  }[];
};

export default function AdminTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [blueprints, setBlueprints] = useState<BlueprintRow[]>([]);
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
      const { data: blueprintData, error: blueprintError } = await supabase
        .from("signature_blueprints")
        .select(`id, name, document_type, scope, is_active, financial_threshold_eur,
          signature_blueprint_steps(id, step_order, role_label, recipient_type, is_required, condition_type, authorization_role)`)
        .order("name");
      if (!active) return;
      if (queryError || blueprintError) {
        setError(queryError?.message ?? blueprintError?.message ?? "Erreur de chargement");
      } else {
        setTemplates((data ?? []) as TemplateRow[]);
        setBlueprints((blueprintData ?? []) as BlueprintRow[]);
      }
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
          <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => router.push("/admin/hotels")}
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            Comptes des hôtels
          </button>
          <button type="button" onClick={() => router.push("/admin/templates/workspaces")}
            className="rounded-xl border border-emerald-600 px-5 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">
            Aperçu par hôtel
          </button>
          <button type="button" onClick={() => router.push("/admin/templates/new")}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
            + Configurer un circuit
          </button>
          </div>
        </div>

        {!loading && !error && (
          <section className="mt-8">
            <h2 className="text-xl font-bold">Catalogue central · nouveaux modèles</h2>
            <p className="mt-1 text-sm text-slate-500">
              Brouillons communs aux hôtels ou au siège. Les modèles inactifs ne sont pas disponibles à l'envoi.
            </p>
            {blueprints.length === 0 ? (
              <div className="mt-4 rounded-xl border bg-white p-5 text-sm text-slate-600">
                Aucun nouveau modèle enregistré.
              </div>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {blueprints.map((item) => (
                  <article key={item.id} className="rounded-xl border bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{item.document_type}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                        {item.scope === "hotels" ? "Hôtels" : "Siège"}
                      </span>
                      <span className={`rounded-full px-3 py-1 ${item.is_active ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>
                        {item.is_active ? "Actif" : "Brouillon inactif"}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-bold">{item.name}</h3>
                    {item.financial_threshold_eur != null && (
                      <p className="mt-1 text-sm text-slate-600">
                        Seuil DI : {item.financial_threshold_eur.toLocaleString("fr-FR")} €
                      </p>
                    )}
                    <button type="button" onClick={() => router.push("/admin/templates/workspaces")} className="mt-4 rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">Voir les hôtels et signataires →</button>
                    <ol className="mt-4 space-y-2">
                      {[...(item.signature_blueprint_steps ?? [])]
                        .sort((a, b) => a.step_order - b.step_order)
                        .map((step) => (
                          <li key={step.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                            {step.step_order}. {step.role_label}
                            <span className="ml-2 text-xs text-slate-500">
                              {step.is_required ? "Obligatoire" : "Conditionnel / facultatif"} · {step.recipient_type}
                              {step.authorization_role === "power_of_attorney" ? " · Fondé de pouvoir" : ""}
                              {step.condition_type === "above_threshold" ? " · DI ≥ seuil" : ""}
                              {step.condition_type === "above_20k_strict" ? " · DR > 20 000 €" : ""}
                            </span>
                          </li>
                        ))}
                    </ol>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
        <h2 className="mt-10 text-xl font-bold">Circuits existants par établissement</h2>
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
