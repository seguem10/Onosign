"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams();

  const userId = params.id as string;
  const [fullName, setFullName] = useState("");
const [jobTitle, setJobTitle] = useState("");
const [department, setDepartment] = useState("");
const [phone, setPhone] = useState("");
type WorkspaceOption = {
  id: string;
  name: string;
  type: string;
};

const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
const [primaryWorkspaceId, setPrimaryWorkspaceId] = useState("");
const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
const [loading, setLoading] = useState(true);
const [errorMessage, setErrorMessage] = useState("");
const [saving, setSaving] = useState(false);
const [successMessage, setSuccessMessage] = useState("");


useEffect(() => {
  async function loadUser() {
    setLoading(true);
    setErrorMessage("");

    const supabase = createClient();

    const { data, error } = await supabase
      .from("profiles")
      .select("full_name, job_title, department, phone, primary_workspace_id")
      .eq("id", userId)
      .single();

    if (error) {
      setErrorMessage(error.message);
    } else {
      setFullName(data.full_name || "");
      setJobTitle(data.job_title || "");
      setDepartment(data.department || "");
      setPhone(data.phone || "");
      if (data.primary_workspace_id) {
  setPrimaryWorkspaceId(data.primary_workspace_id);
} else {
  // Compatibilité avec les comptes créés avant l'ajout
  // du champ primary_workspace_id.
  const { data: memberships, error: membershipsError } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces!inner(type)")
    .eq("user_id", userId)
    .in("workspaces.type", ["hotel", "head_office"])
    .limit(1);

  if (membershipsError) {
    console.error(
      "Erreur chargement établissement principal :",
      membershipsError
    );
  } else if (memberships?.length) {
    setPrimaryWorkspaceId(memberships[0].workspace_id);
  }
}
    }

    setLoading(false);
  }

  if (userId) {
    loadUser();
  }
}, [userId]);
useEffect(() => {
  async function loadWorkspaces() {
    setLoadingWorkspaces(true);

    const supabase = createClient();

    const { data, error } = await supabase
      .from("workspaces")
      .select("id, name, type")
      .in("type", ["hotel", "head_office"])
      .eq("is_active", true)
      .order("name");

    if (error) {
      console.error("Erreur chargement établissements :", error);
      setErrorMessage(
        "Impossible de charger la liste des établissements."
      );
    } else {
      setWorkspaces(data || []);
    }

    setLoadingWorkspaces(false);
  }

  loadWorkspaces();
}, []);
async function handleSaveUser() {
  setErrorMessage("");
  setSuccessMessage("");

  if (!fullName.trim()) {
    setErrorMessage("Le nom complet est obligatoire.");
    return;
  }

  try {
    setSaving(true);

    const response = await fetch(
      `/api/admin/users/${userId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          jobTitle: jobTitle.trim(),
          department: department.trim(),
          phone: phone.trim(),
        }),
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      setErrorMessage(
        result.message ||
          "Impossible de modifier l'utilisateur."
      );
      return;
    }

    setSuccessMessage(
      "Utilisateur modifié avec succès."
    );

    setTimeout(() => {
      router.push(`/admin/users/${userId}`);
    }, 1000);
  } catch (error) {
    console.error("Update user error:", error);

    setErrorMessage(
      "Une erreur est survenue pendant l'enregistrement."
    );
  } finally {
    setSaving(false);
  }
}
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <button
            type="button"
            onClick={() => router.push(`/admin/users/${userId}`)}
            className="text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            ← Retour à la fiche utilisateur
          </button>

          <div className="mt-4 flex items-center gap-3">
            <span className="text-2xl font-bold text-emerald-600">
              OnoSign
            </span>

            <span className="text-slate-300">/</span>

            <span className="font-semibold text-slate-700">
              Modifier l’utilisateur
            </span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">
          Administration
        </p>

        <h1 className="mt-2 text-3xl font-bold text-slate-900">
          Modifier l’utilisateur
        </h1>

        <p className="mt-2 text-slate-500">
          Gérez les informations et les accès de cet utilisateur OnoSign.
        </p>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">
            Informations utilisateur
          </h2>

        {loading ? (
  <p className="mt-4 text-sm text-slate-500">
    Chargement des informations...
  </p>
) : errorMessage ? (
  <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
    {errorMessage}
  </div>
) : (
  <div className="mt-6 grid gap-6 md:grid-cols-2">

    {/* NOM COMPLET */}
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-700">
        Nom complet
      </label>

      <input
        type="text"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
      />
    </div>

    {/* FONCTION */}
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-700">
        Fonction
      </label>

      <input
        type="text"
        value={jobTitle}
        onChange={(e) => setJobTitle(e.target.value)}
        className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
      />
    </div>

    {/* DEPARTEMENT */}
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-700">
        Département
      </label>

      <input
        type="text"
        value={department}
        onChange={(e) => setDepartment(e.target.value)}
        className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
      />
    </div>

    {/* TELEPHONE */}
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-700">
        Téléphone
      </label>

      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+212..."
        className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
      />
    </div>

  </div>
)}
{errorMessage && (
  <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
    {errorMessage}
  </div>
)}

{successMessage && (
  <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
    {successMessage}
  </div>
)}
{/* ÉTABLISSEMENT PRINCIPAL */}
<div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
  <h2 className="text-lg font-bold text-slate-900">
    Établissement principal
  </h2>

  <p className="mt-2 text-sm text-slate-500">
    Sélectionnez l'hôtel ou le siège auquel cet utilisateur est affecté.
  </p>

  <div className="mt-5">
    <label className="mb-2 block text-sm font-semibold text-slate-700">
      Hôtel / Siège
    </label>

    <select
      value={primaryWorkspaceId}
      onChange={(e) => setPrimaryWorkspaceId(e.target.value)}
      disabled={loadingWorkspaces}
      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-emerald-500 disabled:bg-slate-100"
    >
      <option value="">
        {loadingWorkspaces
          ? "Chargement des établissements..."
          : "Sélectionner un établissement"}
      </option>

      {workspaces.map((workspace) => (
        <option key={workspace.id} value={workspace.id}>
          {workspace.name}
          {workspace.type === "hotel" ? " — Hôtel" : " — Siège"}
        </option>
      ))}
    </select>
  </div>

  <p className="mt-3 text-xs text-amber-700">
    Ce champ est en préparation. Le changement d'établissement
    ne sera pas enregistré pour le moment.
  </p>
</div>
{/* ACTIONS */}
{!loading && !errorMessage && (
  <div className="mt-8 flex justify-end gap-3">
    <button
      type="button"
      onClick={() =>
        router.push(`/admin/users/${userId}`)
      }
      className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-700 hover:bg-slate-50"
    >
      Annuler
    </button>

    <button
  type="button"
  onClick={handleSaveUser}
  disabled={saving}
  className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
>
  {saving ? "Enregistrement..." : "Enregistrer les modifications"}
</button>
  </div>
)}
        </div>
      </section>
    </main>
  );
}