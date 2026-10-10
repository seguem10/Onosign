"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = {
  id: string;
  role: string;
  name: string;
  email: string;
  action: "signer" | "cc";
  required: boolean;
  authorization_role: "none" | "power_of_attorney";
  condition: "always" | "it" | "above_threshold";
};

const initialSteps: Step[] = [
  { id: "requester", role: "Demandeur", name: "", email: "", action: "signer", required: true, authorization_role: "none", condition: "always" },
  { id: "dg", role: "DG", name: "", email: "", action: "signer", required: false, authorization_role: "none", condition: "always" },
  { id: "raf", role: "RAF", name: "", email: "", action: "signer", required: false, authorization_role: "none", condition: "always" },
];

// Circuit transcribed from ONOMO "Payment Request Form - Above 5000 Euros Expenses".
const paymentRequestSteps: Step[] = [
  { id: "requester", role: "Enquirer / Demandeur", name: "", email: "", action: "signer", required: true, authorization_role: "none", condition: "always" },
  { id: "finance", role: "Financial Department / Service financier", name: "", email: "", action: "signer", required: true, authorization_role: "none", condition: "always" },
  { id: "director1", role: "Director / Directeur 1", name: "", email: "", action: "signer", required: true, authorization_role: "none", condition: "always" },
  { id: "director2", role: "Director / Directeur 2 (si montant > 20 000 €)", name: "", email: "", action: "signer", required: false, authorization_role: "none", condition: "always" },
];

export default function NewAdminTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState("Circuit standard");
  const [documentType, setDocumentType] = useState<"DI" | "DR">("DI");
  const [scope, setScope] = useState<"hotels" | "head_office">("hotels");
  const [threshold, setThreshold] = useState("20000");
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const [sourcePreset, setSourcePreset] = useState(false);
  function loadPaymentRequestPreset() {
    setDocumentType("DR");
    setName("DR - Payment Request Form - Above 5000 Euros");
    setScope("head_office");
    setSteps(paymentRequestSteps.map((step) => ({ ...step })));
    setSourcePreset(true);
    setNotice("Circuit importé depuis le formulaire ONOMO. La 4e signature est conditionnelle (> 20 000 €) dans le PDF mais la condition DR n'est pas encore automatisée. Modèle brouillon uniquement.");
  }

  function change(id: string, patch: Partial<Step>) {
    setSteps((items) => items.map((step) => step.id === id ? { ...step, ...patch } : step));
  }

  function move(index: number, delta: number) {
    const nextIndex = index + delta;
    if (index === 0 || nextIndex < 1 || nextIndex >= steps.length) return;
    setSteps((items) => {
      const next = [...items];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function addStep() {
    setSteps((items) => [...items, {
      id: crypto.randomUUID(), role: "", name: "", email: "",
      action: "signer", required: false, authorization_role: "none", condition: "always",
    }]);
  }

  const validThreshold = threshold.trim() !== "" && Number.isFinite(Number(threshold)) && Number(threshold) > 0 && /^\\d+(?:\\.\\d{1,2})?$/.test(threshold.trim());
  const validRoles = steps.every((step) => step.role.trim().length > 0);
  const validRequester = steps[0]?.id === "requester" && steps[0]?.required && steps[0]?.action === "signer" && steps[0]?.condition === "always" && !steps[0]?.name && !steps[0]?.email;
  const validConditions = steps.every((step) => (step.authorization_role !== "power_of_attorney" || (documentType === "DI" && step.action === "signer" && step.required && step.id !== "requester" && step.condition !== "it")) &&  (documentType === "DI" || step.condition !== "above_threshold") && (step.action !== "cc" || !step.required));
  const validEmails = steps.every((step) => !step.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(step.email));
  const preview = {
    name: name.trim(),
    document_type: documentType,
    scope,
    financial_rule: documentType === "DI" ? {
      currency: "EUR", threshold: Number(threshold),
      powers_below: 1, powers_at_or_above: 2,
    } : null,
    steps: steps.map((step, index) => ({ ...step, order: index + 1 })),
  };

  async function saveDraft() {
    setNotice("");
    if (!name.trim() || !validRoles || !validRequester || !validEmails || !validConditions || (documentType === "DI" && !validThreshold)) {
      setNotice("Corrigez les champs avant d'enregistrer.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), document_type: documentType, scope,
          threshold_eur: documentType === "DI" ? Number(threshold) : null,
          steps: steps.map((step, index) => ({
            role: step.role.trim(), name: step.name.trim(), email: step.email.trim(),
            action: step.action, condition: step.condition,
            required: step.required, is_requester: index === 0, authorization_role: step.authorization_role,
          })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Échec de l'enregistrement.");
      router.push("/admin/templates");
      router.refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Échec de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <button type="button" onClick={() => router.push("/admin/templates")} className="text-sm text-slate-600">
          ← Modèles DI / DR
        </button>
        <h1 className="mt-7 text-3xl font-bold">Configurer un circuit de signature</h1>
        <p className="mt-2 text-slate-600">
          Préparez un modèle commun aux hôtels ou un circuit du siège. L'enregistrement crée un brouillon inactif dans Supabase.
        </p>
        <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Les modèles créés restent inactifs. Les règles de signature financière ne sont pas encore vérifiées lors de l’envoi : ne pas utiliser ces brouillons pour des signatures réelles.
        </div>

        <section className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-5">
          <h2 className="font-bold text-sky-950">Modèle ONOMO fourni : Payment Request Form</h2>
          <p className="mt-1 text-sm text-sky-900">Demande de paiement supérieure à 5 000 € : Demandeur → Service financier → Directeur → 2e directeur si montant strictement supérieur à 20 000 €.</p>
          <button type="button" onClick={loadPaymentRequestPreset}
            className="mt-3 rounded-lg bg-sky-800 px-4 py-2 text-sm font-semibold text-white">
            Charger le circuit du formulaire fourni
          </button>
          {sourcePreset && <p className="mt-2 text-xs text-amber-900">Attention : le 2e directeur reste facultatif dans ce brouillon. Le seuil DR du formulaire doit être implémenté côté serveur avant activation. Le PDF original n'est pas encore stocké dans l'application.</p>}
        </section>
        <section className="mt-6 grid gap-4 rounded-2xl border bg-white p-6 md:grid-cols-2">
          <label className="text-sm font-semibold">Nom du modèle
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="mt-2 w-full rounded-lg border p-3 font-normal" />
          </label>
          <label className="text-sm font-semibold">Type de document
            <select value={documentType} onChange={(e) => {
                const next = e.target.value as "DI" | "DR";
                setDocumentType(next);
                if (next === "DR") setSteps((items) => items.map((step) => ({...step, authorization_role: "none", condition: step.condition === "above_threshold" ? "always" : step.condition})));
              }}
              className="mt-2 w-full rounded-lg border p-3 font-normal">
              <option value="DI">DI</option><option value="DR">DR</option>
            </select>
          </label>
          <label className="text-sm font-semibold">Périmètre
            <select value={scope} onChange={(e) => setScope(e.target.value as "hotels" | "head_office")}
              className="mt-2 w-full rounded-lg border p-3 font-normal">
              <option value="hotels">Modèle commun aux hôtels</option>
              <option value="head_office">Départements du siège (sans Aleph par défaut)</option>
            </select>
          </label>
          {documentType === "DI" && (
            <label className="text-sm font-semibold">Seuil de double signature (€)
              <input type="number" min="1" step="0.01" value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="mt-2 w-full rounded-lg border p-3 font-normal" />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                En dessous : 1 fondé de pouvoir. À partir du seuil : 2.
              </span>
            </label>
          )}
        </section>

        <section className="mt-6 rounded-2xl border bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Signataires par défaut</h2>
              <p className="mt-1 text-sm text-slate-500">Ordre, coordonnées, action et conditions d'application.</p>
            </div>
            <button type="button" onClick={addStep} className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white">
              + Ajouter un destinataire
            </button>
          </div>
          <div className="mt-5 space-y-4">
            {steps.map((step, index) => (
              <div key={step.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Étape {index + 1}{index === 0 ? " · Demandeur" : ""}</p>
                  <div className="flex gap-2">
                    <button type="button" disabled={index <= 1} onClick={() => move(index, -1)}
                      className="rounded border px-3 py-1 disabled:opacity-30" aria-label="Monter">↑</button>
                    <button type="button" disabled={index === 0 || index === steps.length - 1} onClick={() => move(index, 1)}
                      className="rounded border px-3 py-1 disabled:opacity-30" aria-label="Descendre">↓</button>
                    {index !== 0 && <button type="button" onClick={() => setSteps((items) => items.filter((item) => item.id !== step.id))}
                      className="rounded border border-red-200 px-3 py-1 text-red-700">Supprimer</button>}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className="text-sm">Fonction
                    <input disabled={index === 0} value={step.role} onChange={(e) => change(step.id, { role: e.target.value })}
                      className="mt-1 w-full rounded-lg border p-2 disabled:bg-slate-100" />
                  </label>
                  <label className="text-sm">Nom par défaut
                    <input disabled={index === 0} value={step.name} onChange={(e) => change(step.id, { name: e.target.value })}
                      placeholder={index === 0 ? "Utilisateur connecté" : "Nom"} className="mt-1 w-full rounded-lg border p-2 disabled:bg-slate-100" />
                  </label>
                  <label className="text-sm">E-mail par défaut
                    <input disabled={index === 0} type="email" value={step.email} onChange={(e) => change(step.id, { email: e.target.value })}
                      placeholder={index === 0 ? "Utilisateur connecté" : "adresse@exemple.com"} className="mt-1 w-full rounded-lg border p-2 disabled:bg-slate-100" />
                  </label>
                  <label className="text-sm">Action
                    <select disabled={index === 0} value={step.action} onChange={(e) => change(step.id, { action: e.target.value as Step["action"], ...(e.target.value === "cc" ? { required: false, authorization_role: "none" } : {}) })}
                      className="mt-1 w-full rounded-lg border p-2 disabled:bg-slate-100">
                      <option value="signer">Doit signer</option><option value="cc">Reçoit une copie</option>
                    </select>
                  </label>
                  {documentType === "DI" && index > 0 && (
                    <label className="text-sm">Habilitation financière
                      <select value={step.authorization_role} onChange={(e) => change(step.id, {
                        authorization_role: e.target.value as Step["authorization_role"],
                        ...(e.target.value === "power_of_attorney" ? { action: "signer" as const, required: true } : {}),
                      })} className="mt-1 w-full rounded-lg border p-2">
                        <option value="none">Aucune</option>
                        <option value="power_of_attorney">Fondé de pouvoir</option>
                      </select>
                    </label>
                  )}
                  <label className="text-sm">Condition
                    <select disabled={index === 0} value={step.condition} onChange={(e) => change(step.id, { condition: e.target.value as Step["condition"] })}
                      className="mt-1 w-full rounded-lg border p-2 disabled:bg-slate-100">
                      <option value="always">Toujours</option>
                      <option value="it">Demande concernant l'IT</option>
                      {documentType === "DI" && <option value="above_threshold">Montant ≥ seuil</option>}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 self-end pb-2 text-sm">
                    <input type="checkbox" checked={step.required} disabled={index === 0}
                      onChange={(e) => change(step.id, { required: e.target.checked, ...(!e.target.checked ? { authorization_role: "none" } : {}) })} />
                    Étape obligatoire
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" disabled={saving || !name.trim() || !validRoles || !validRequester || !validEmails || !validConditions || (documentType === "DI" && !validThreshold)}
            onClick={() => void saveDraft()}
            className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white disabled:opacity-40">
            {saving ? "Enregistrement…" : "Enregistrer le brouillon"}
          </button>
          {notice && <p role="status" className="self-center text-sm text-emerald-700">{notice}</p>}
        </div>
        <details className="mt-6 rounded-xl border bg-white p-5">
          <summary className="cursor-pointer font-semibold">Aperçu technique du circuit</summary>
          <pre className="mt-4 overflow-auto text-xs">{JSON.stringify(preview, null, 2)}</pre>
        </details>
      </div>
    </main>
  );
}
