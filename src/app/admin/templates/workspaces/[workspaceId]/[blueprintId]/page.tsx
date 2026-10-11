"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Step = {
  id: string;
  step_order: number;
  role_label: string;
  is_requester: boolean;
  is_required: boolean;
  default_name: string | null;
  default_email: string | null;
  condition_type: string;
  authorization_role: string;
};
type Edit = { step_id: string; name: string; email: string; enabled: boolean };
type Blueprint = {
  id: string; name: string; scope: string;
  signature_blueprint_steps: Step[];
};

export default function HotelTemplateEditPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string; blueprintId: string }>();
  const workspaceId = params.workspaceId;
  const blueprintId = params.blueprintId;
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Edit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const supabase = createClient();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !auth.user) { router.replace("/"); return; }
      const [w, b, o] = await Promise.all([
        supabase.from("workspaces").select("id,name,type,organization_id").eq("id", workspaceId).single(),
        supabase.from("signature_blueprints")
          .select(`id,name,scope,organization_id,
            signature_blueprint_steps(id,step_order,role_label,is_requester,is_required,default_name,default_email,condition_type,authorization_role)`)
          .eq("id", blueprintId).single(),
        supabase.from("signature_blueprint_overrides")
          .select(`id,signature_blueprint_step_overrides(step_id,default_name,default_email,is_enabled)`)
          .eq("workspace_id", workspaceId).eq("blueprint_id", blueprintId).maybeSingle(),
      ]);
      if (!active) return;
      const failure = w.error ?? b.error ?? o.error;
      if (failure || !w.data || !b.data) {
        setMessage(failure?.message ?? "Établissement ou modèle introuvable.");
      } else if (
        w.data.organization_id !== b.data.organization_id ||
        (w.data.type === "hotel" ? b.data.scope !== "hotels" : b.data.scope !== "head_office")
      ) {
        setMessage("Ce modèle ne correspond pas à cet établissement.");
      } else {
        const model = b.data as Blueprint;
        setBlueprint(model);
        setWorkspaceName(w.data.name);
        setOverrideId(o.data?.id ?? null);
        const overrides = o.data?.signature_blueprint_step_overrides ?? [];
        setEdits(model.signature_blueprint_steps.map((step) => {
          const found = overrides.find((entry) => entry.step_id === step.id);
          return {
            step_id: step.id,
            name: step.is_requester ? "" : (found?.default_name ?? step.default_name ?? ""),
            email: step.is_requester ? "" : (found?.default_email ?? step.default_email ?? ""),
            enabled: found?.is_enabled ?? true,
          };
        }));
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [router, workspaceId, blueprintId]);

  const orderedSteps = useMemo(() =>
    [...(blueprint?.signature_blueprint_steps ?? [])].sort((a, b) => a.step_order - b.step_order),
    [blueprint]
  );
  function update(stepId: string, patch: Partial<Edit>) {
    setDirty(true);
    setEdits((current) => current.map((item) =>
      item.step_id === stepId ? { ...item, ...patch } : item
    ));
  }

  async function save() {
    if (!blueprint || saving) return;
    setMessage("");
    const valid = orderedSteps.every((step) => {
      const edit = edits.find((item) => item.step_id === step.id);
      if (!edit) return false;
      if ((step.is_required || step.is_requester) && !edit.enabled) return false;
      return !edit.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(edit.email);
    });
    if (!valid) { setMessage("Vérifiez les e-mails et les étapes obligatoires."); return; }
    const emails = edits.filter((item) => item.enabled && item.email.trim()).map((item) => item.email.trim().toLowerCase());
    if (new Set(emails).size !== emails.length) { setMessage("Deux signataires ne peuvent pas partager la même adresse e-mail."); return; }
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Session expirée.");
      const { data: parent, error: parentError } = await supabase
        .from("signature_blueprint_overrides")
        .upsert({ blueprint_id: blueprintId, workspace_id: workspaceId, is_enabled: true },
          { onConflict: "blueprint_id,workspace_id" })
        .select("id").single();
      if (parentError || !parent) throw parentError ?? new Error("Impossible d'enregistrer l'établissement.");
      setOverrideId(parent.id);
      const { error: stepsError } = await supabase
        .from("signature_blueprint_step_overrides")
        .upsert(edits.map((edit) => ({
          blueprint_override_id: parent.id,
          step_id: edit.step_id,
          default_name: orderedSteps.find((step) => step.id === edit.step_id)?.is_requester ? null : (edit.name.trim() || null),
          default_email: orderedSteps.find((step) => step.id === edit.step_id)?.is_requester ? null : (edit.email.trim() || null),
          is_enabled: edit.enabled,
        })), { onConflict: "blueprint_override_id,step_id" });
      if (stepsError) throw stepsError;
      setDirty(false);
      setMessage("Personnalisation enregistrée. Elle ne modifie pas le modèle central.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <button type="button" onClick={() => router.push("/admin/templates/workspaces")}
          className="text-sm text-slate-600">← Aperçu par établissement</button>
        <h1 className="mt-6 text-3xl font-bold">Personnaliser les signataires</h1>
        {loading ? <p className="mt-8">Chargement…</p> : blueprint ? (
          <>
            <p className="mt-2 text-slate-600">{workspaceName} · {blueprint.name}</p>
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Les étapes obligatoires ne peuvent pas être désactivées. La sauvegarde concerne uniquement
              les coordonnées et les étapes facultatives. Aucun envoi de signature n'est déclenché.
            </p>
            <div className="mt-6 space-y-4">
              {orderedSteps.map((step) => {
                const edit = edits.find((item) => item.step_id === step.id);
                if (!edit) return null;
                return (
                  <section key={step.id} className="rounded-2xl border bg-white p-5">
                    <div className="flex flex-wrap justify-between gap-3">
                      <h2 className="font-bold">{step.step_order}. {step.role_label}</h2>
                      <span className="text-sm text-slate-500">
                        {step.is_requester ? "Demandeur" : step.is_required ? "Obligatoire" : "Facultatif"}
                      </span>
                    </div>
                    {!step.is_requester && <p className="mt-2 text-xs text-slate-500">{step.authorization_role === "power_of_attorney" ? "Fondé de pouvoir (DI)" : step.condition_type === "above_20k_strict" ? "Deuxième directeur si DR strictement supérieure à 20 000 €" : step.condition_type === "above_threshold" ? "Étape conditionnelle au seuil DI" : "Étape du circuit"}</p>}
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="text-sm">Nom
                        <input value={edit.name} disabled={step.is_requester}
                          onChange={(e) => update(step.id, { name: e.target.value })}
                          className="mt-1 w-full rounded-lg border p-3 disabled:bg-slate-100"
                          placeholder={step.is_requester ? "Compte connecté" : "Nom du signataire"} />
                      </label>
                      <label className="text-sm">E-mail
                        <input type="email" value={edit.email} disabled={step.is_requester}
                          onChange={(e) => update(step.id, { email: e.target.value })}
                          className="mt-1 w-full rounded-lg border p-3 disabled:bg-slate-100"
                          placeholder={step.is_requester ? "Compte connecté" : "prenom@exemple.com"} />
                      </label>
                    </div>
                    <label className="mt-4 flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={edit.enabled}
                        disabled={step.is_required || step.is_requester}
                        onChange={(e) => update(step.id, { enabled: e.target.checked })} />
                      Activer cette étape pour l'établissement
                    </label>
                  </section>
                );
              })}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <button type="button" disabled={saving || !dirty} onClick={() => void save()}
                className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white disabled:opacity-50">
                {saving ? "Enregistrement…" : dirty ? "Enregistrer les personnalisations" : "Aucune modification"}
              </button>
              {overrideId && <span className="text-xs text-slate-500">Configuration existante</span>}
            </div>
          </>
        ) : null}
        {message && <p role="status" className="mt-5 rounded-xl bg-white p-4 text-sm">{message}</p>}
      </div>
    </main>
  );
}
