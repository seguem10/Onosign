"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Workspace = { id: string; name: string; type: string; organization_id: string };
type Blueprint = { id: string; name: string; scope: string; document_type: string; organization_id: string; is_active: boolean };
type Step = { id: string; step_order: number; role_label: string; default_name: string | null; default_email: string | null; is_required: boolean; condition_type: string; recipient_type: string };
type StepOverride = { step_id: string; default_name: string | null; default_email: string | null; is_enabled: boolean };
type Override = { id: string; blueprint_id: string; workspace_id: string; is_enabled: boolean };

export default function BlueprintWorkspacePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const blueprintId = params.id;
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [stepOverrides, setStepOverrides] = useState<StepOverride[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const supabase = createClient();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !auth.user) { router.replace("/"); return; }
      const [model, ws, modelSteps, modelOverrides] = await Promise.all([
        supabase.from("signature_blueprints")
          .select("id,name,scope,document_type,organization_id,is_active")
          .eq("id", blueprintId).maybeSingle(),
        supabase.from("workspaces")
          .select("id,name,type,organization_id").order("name"),
        supabase.from("signature_blueprint_steps")
          .select("id,step_order,role_label,default_name,default_email,is_required,condition_type,recipient_type")
          .eq("blueprint_id", blueprintId).order("step_order"),
        supabase.from("signature_blueprint_overrides")
          .select("id,blueprint_id,workspace_id,is_enabled")
          .eq("blueprint_id", blueprintId),
      ]);
      if (!active) return;
      const failure = model.error || ws.error || modelSteps.error || modelOverrides.error;
      if (failure) setError(failure.message);
      else if (!model.data) setError("Modèle introuvable ou accès refusé.");
      else {
        setBlueprint(model.data as Blueprint);
        const scopeTypes = model.data.scope === "hotels"
          ? ["hotel"] : ["head_office", "head_office_department"];
        const allowed = ((ws.data ?? []) as Workspace[]).filter(
          (w) => w.organization_id === model.data.organization_id && scopeTypes.includes(w.type)
        );
        setWorkspaces(allowed);
        setSelectedWorkspace(allowed[0]?.id ?? "");
        setSteps((modelSteps.data ?? []) as Step[]);
        setOverrides((modelOverrides.data ?? []) as Override[]);
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [blueprintId, router]);

  useEffect(() => {
    let active = true;
    async function loadStepOverrides() {
      const current = overrides.find((item) => item.workspace_id === selectedWorkspace);
      if (!current) { setStepOverrides([]); return; }
      const supabase = createClient();
      const { data, error: queryError } = await supabase
        .from("signature_blueprint_step_overrides")
        .select("step_id,default_name,default_email,is_enabled")
        .eq("blueprint_override_id", current.id);
      if (!active) return;
      if (queryError) setError(queryError.message);
      else setStepOverrides((data ?? []) as StepOverride[]);
    }
    void loadStepOverrides();
    return () => { active = false; };
  }, [selectedWorkspace, overrides]);

  const currentOverride = overrides.find((item) => item.workspace_id === selectedWorkspace);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <button type="button" onClick={() => router.push("/admin/templates")}
          className="text-sm font-medium text-slate-600">← Modèles DI / DR</button>
        <h1 className="mt-7 text-3xl font-bold">Personnalisation par établissement</h1>
        <p className="mt-2 text-slate-600">
          Vérifiez les valeurs héritées du modèle central et les éventuelles adaptations locales.
        </p>
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Consultation uniquement : la modification des signataires sera activée après validation des contrôles serveur.
          Les signataires obligatoires ne doivent jamais être supprimés par une adaptation locale.
        </div>
        {loading ? <p className="mt-8">Chargement…</p> : error ? (
          <p role="alert" className="mt-8 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>
        ) : blueprint ? (
          <>
            <div className="mt-6 rounded-2xl border bg-white p-6">
              <h2 className="text-xl font-bold">{blueprint.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{blueprint.document_type} · {blueprint.scope === "hotels" ? "Hôtels" : "Siège"}</p>
              <label className="mt-5 block text-sm font-semibold">Établissement
                <select value={selectedWorkspace} onChange={(event) => setSelectedWorkspace(event.target.value)}
                  className="mt-2 w-full rounded-lg border p-3 font-normal">
                  {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                </select>
              </label>
              {workspaces.length === 0 ? <p className="mt-4 text-sm text-amber-800">Aucun établissement éligible visible.</p> : (
                <p className="mt-4 text-sm text-slate-600">
                  {currentOverride
                    ? currentOverride.is_enabled ? "Adaptation locale activée" : "Modèle désactivé pour cet établissement"
                    : "Aucune adaptation locale : valeurs du modèle central"}
                </p>
              )}
            </div>
            <section className="mt-6 space-y-3">
              {steps.map((step) => {
                const local = stepOverrides.find((item) => item.step_id === step.id);
                return (
                  <article key={step.id} className="rounded-xl border bg-white p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-bold">{step.step_order}. {step.role_label}</h3>
                      <span className="text-xs text-slate-500">{step.is_required ? "Obligatoire" : "Facultatif"} · {step.recipient_type} · {step.condition_type}</span>
                    </div>
                    <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                      <div><dt className="text-slate-500">Nom effectif</dt><dd className="font-medium">{local?.default_name ?? step.default_name ?? "À renseigner"}</dd></div>
                      <div><dt className="text-slate-500">E-mail effectif</dt><dd className="font-medium">{local?.default_email ?? step.default_email ?? "À renseigner"}</dd></div>
                    </dl>
                    {local && <p className="mt-3 text-xs text-emerald-700">
                      Adaptation locale · {local.is_enabled ? "Étape activée" : "Étape désactivée (non appliquée à l'envoi)"}
                    </p>}
                  </article>
                );
              })}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
