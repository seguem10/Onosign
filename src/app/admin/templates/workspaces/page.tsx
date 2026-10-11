"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Workspace = { id: string; name: string; type: string };
type Blueprint = {
  id: string; name: string; scope: string; document_type: string;
  signature_blueprint_steps: Array<{
    id: string; step_order: number; role_label: string;
    default_name: string | null; default_email: string | null;
    recipient_type: string; is_required: boolean; is_requester: boolean; condition_type: string;
  }>;
};
type Override = {
  id: string; blueprint_id: string; workspace_id: string; is_enabled: boolean;
  signature_blueprint_step_overrides: Array<{
    step_id: string; default_name: string | null;
    default_email: string | null; is_enabled: boolean;
  }>;
};

export default function HotelWorkflowPreview() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [blueprintId, setBlueprintId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const supabase = createClient();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !auth.user) { router.replace("/"); return; }
      const [w, b, o] = await Promise.all([
        supabase.from("workspaces").select("id,name,type").order("name"),
        supabase.from("signature_blueprints")
          .select(`id,name,scope,document_type,
            signature_blueprint_steps(id,step_order,role_label,default_name,default_email,recipient_type,is_required,is_requester,condition_type)`)
          .order("name"),
        supabase.from("signature_blueprint_overrides")
          .select(`id,blueprint_id,workspace_id,is_enabled,
            signature_blueprint_step_overrides(step_id,default_name,default_email,is_enabled)`),
      ]);
      if (!active) return;
      const failure = w.error ?? b.error ?? o.error;
      if (failure) setError(failure.message);
      else {
        const ws = (w.data ?? []) as Workspace[];
        const bp = (b.data ?? []) as Blueprint[];
        setWorkspaces(ws);
        setBlueprints(bp);
        setOverrides((o.data ?? []) as Override[]);
        setWorkspaceId(ws.find((item) => item.type === "hotel")?.id ?? "");
        setBlueprintId(bp.find((item) => item.scope === "hotels")?.id ?? "");
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [router]);

  const workspace = workspaces.find((item) => item.id === workspaceId);
  const available = useMemo(() => blueprints.filter((item) =>
    workspace?.type === "hotel" ? item.scope === "hotels" : item.scope === "head_office"
  ), [blueprints, workspace?.type]);
  const selectedBlueprint = available.find((item) => item.id === blueprintId) ?? available[0];
  const override = overrides.find((item) =>
    item.workspace_id === workspaceId && item.blueprint_id === selectedBlueprint?.id
  );
  const steps = [...(selectedBlueprint?.signature_blueprint_steps ?? [])]
    .sort((a, b) => a.step_order - b.step_order)
    .map((step) => {
      const change = override?.signature_blueprint_step_overrides.find((item) => item.step_id === step.id);
      return {
        ...step,
        name: change?.default_name ?? step.default_name,
        email: change?.default_email ?? step.default_email,
        enabled: change?.is_enabled ?? true,
      };
    });

  const configured = steps.filter((step) => !step.is_requester && step.enabled);
  const incomplete = configured.filter((step) => !step.name?.trim() || !step.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(step.email));
  const duplicateEmails = configured.map((step) => step.email?.trim().toLowerCase()).filter(Boolean);
  const duplicates = new Set(duplicateEmails).size !== duplicateEmails.length;
  const mandatoryDisabled = steps.some((step) => step.is_required && !step.enabled);
  const configurationReady = !!selectedBlueprint && configured.length > 0 && incomplete.length === 0 && !duplicates && !mandatoryDisabled && override?.is_enabled !== false;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <button type="button" onClick={() => router.push("/admin/templates")}
          className="text-sm font-medium text-slate-600">← Modèles DI / DR</button>
        <h1 className="mt-6 text-3xl font-bold">Aperçu par établissement</h1>
        <p className="mt-2 text-slate-600">
          Vérifiez comment un modèle central sera personnalisé pour chaque hôtel ou service du siège.
          Cet écran est en lecture seule.
        </p>
        {loading ? <p className="mt-8">Chargement…</p> : error ? (
          <p role="alert" className="mt-8 rounded-xl bg-red-50 p-5 text-red-700">{error}</p>
        ) : (
          <>
            <section className="mt-8 grid gap-4 rounded-2xl border bg-white p-6 md:grid-cols-2">
              <label className="text-sm font-semibold">Établissement
                <select value={workspaceId} onChange={(e) => {
                  setWorkspaceId(e.target.value); setBlueprintId("");
                }} className="mt-2 w-full rounded-lg border p-3 font-normal">
                  {workspaces.filter((w) => ["hotel","head_office","head_office_department","sarh"].includes(w.type))
                    .map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold">Modèle central
                <select value={selectedBlueprint?.id ?? ""} onChange={(e) => setBlueprintId(e.target.value)}
                  className="mt-2 w-full rounded-lg border p-3 font-normal">
                  {available.length === 0 && <option value="">Aucun modèle pour ce périmètre</option>}
                  {available.map((b) => <option key={b.id} value={b.id}>{b.document_type} · {b.name}</option>)}
                </select>
              </label>
            </section>
            {!selectedBlueprint ? (
              <div className="mt-6 rounded-xl border bg-white p-6 text-slate-600">
                Créez d'abord un modèle central correspondant à cet établissement.
              </div>
            ) : (
              <section className="mt-6 rounded-2xl border bg-white p-6">
                <h2 className="text-xl font-bold">{selectedBlueprint.name}</h2>
                <div className={`mt-4 rounded-xl border p-4 text-sm ${configurationReady ? "border-green-200 bg-green-50 text-green-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                  <strong>{configurationReady ? "Coordonnées renseignées (contrôle indicatif)" : "Configuration des signataires incomplète"}</strong>
                  <p className="mt-1">Ce contrôle est indicatif : il ne valide ni les montants ni l’autorisation d’envoi.</p>
                  {incomplete.length > 0 && <p>{incomplete.length} signataire(s) avec nom ou e-mail manquant / invalide.</p>}
                  {duplicates && <p>Des signataires partagent la même adresse e-mail.</p>}
                  {mandatoryDisabled && <p>Une étape obligatoire est désactivée.</p>}
                  {override?.is_enabled === false && <p>Ce modèle est désactivé pour cet établissement.</p>}
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {override ? (override.is_enabled ? "Personnalisation existante" : "Modèle désactivé pour cet établissement")
                    : "Aucune personnalisation : valeurs du modèle central"}
                </p>
                <button type="button"
                  onClick={() => router.push(`/admin/templates/workspaces/${workspaceId}/${selectedBlueprint.id}`)}
                  className="mt-4 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
                  Personnaliser les signataires
                </button>
                <ol className="mt-5 space-y-3">
                  {steps.map((step) => (
                    <li key={step.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-semibold">{step.step_order}. {step.role_label}</span>
                        <span className={step.enabled ? "text-sm text-emerald-700" : "text-sm text-red-700"}>
                          {step.enabled ? "Activé" : "Désactivé"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {step.is_requester ? "Identité du demandeur : compte connecté lors de la création du document" : `${step.name || "Nom à compléter"} · ${step.email || "E-mail à compléter"}`}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {step.recipient_type} · {step.is_required ? "Obligatoire" : "Facultatif"} · {step.condition_type}
                      </p>
                      {!step.enabled && step.is_required && (
                        <p className="mt-2 text-sm font-semibold text-red-700">
                          Attention : une étape obligatoire est désactivée. Le serveur devra refuser cet envoi.
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
