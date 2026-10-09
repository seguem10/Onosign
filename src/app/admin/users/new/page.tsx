"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Workspace = {
  id: string;
  name: string;
  type: "hotel" | "head_office" | "head_office_department" | "sarh";
  parent_workspace_id: string | null;
  country_code: string | null;
};

export default function NewUserPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [password, setPassword] = useState("");

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] =
    useState(true);

  const [
    selectedWorkspaceIds,
    setSelectedWorkspaceIds,
  ] = useState<string[]>([]);

  const [primaryWorkspaceId, setPrimaryWorkspaceId] =
    useState("");

  const [primaryDepartmentId, setPrimaryDepartmentId] =
    useState("");
    const [accessRole, setAccessRole] =
  useState<"member" | "admin">("member");
  const [saving, setSaving] = useState(false);
const [errorMessage, setErrorMessage] = useState("");
const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const supabase = createClient();

    async function loadWorkspaces() {
      setLoadingWorkspaces(true);

      const { data, error } = await supabase
        .from("workspaces")
        .select(
          "id, name, type, parent_workspace_id, country_code"
        )
        .eq("is_active", true)
        .order("name", {
          ascending: true,
        });

      if (error) {
        console.error(
          "Unable to load workspaces:",
          error
        );

        setLoadingWorkspaces(false);
        return;
      }

      setWorkspaces((data || []) as Workspace[]);
      setLoadingWorkspaces(false);
    }

    loadWorkspaces();
  }, []);

  function toggleWorkspace(workspaceId: string) {
    setSelectedWorkspaceIds((current) => {
      if (current.includes(workspaceId)) {
        return current.filter(
          (id) => id !== workspaceId
        );
      }

      return [...current, workspaceId];
    });
  }
async function handleCreateUser() {
  setErrorMessage("");
  setSuccessMessage("");

  if (!fullName.trim()) {
    setErrorMessage("Le nom complet est obligatoire.");
    return;
  }

  if (!email.trim()) {
    setErrorMessage("L'email professionnel est obligatoire.");
    return;
  }

  if (password.length < 8) {
    setErrorMessage(
      "Le mot de passe doit contenir au moins 8 caractères."
    );
    return;
  }

  if (!primaryWorkspaceId) {
    setErrorMessage(
      "Veuillez sélectionner un établissement principal."
    );
    return;
  }

  try {
    setSaving(true);

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
        body: JSON.stringify({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        jobTitle: jobTitle.trim(),
        department: department.trim(),
        primaryWorkspaceId,
        primaryDepartmentId: null,
        selectedWorkspaceIds: [],
        accessRole: "member",
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      setErrorMessage(
        result.message ||
          "Impossible de créer l'utilisateur."
      );
      return;
    }

    setSuccessMessage(
      "Utilisateur créé avec succès."
    );

    setTimeout(() => {
      router.push("/admin/users");
    }, 800);
  } catch (error) {
    console.error("Create user error:", error);

    setErrorMessage(
      "Une erreur est survenue pendant la création."
    );
  } finally {
    setSaving(false);
  }
}
  const availableDepartments = workspaces.filter(
    (workspace) =>
      workspace.parent_workspace_id ===
      primaryWorkspaceId
  );

  return (
    <main className="min-h-screen bg-slate-50">
      {/* HEADER */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <button
            type="button"
            onClick={() =>
              router.push("/admin/users")
            }
            className="text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            ← Utilisateurs
          </button>

          <div className="mt-4 flex items-center gap-3">
            <span className="text-2xl font-bold text-emerald-600">
              OnoSign
            </span>

            <span className="text-slate-300">
              /
            </span>

            <span className="font-semibold text-slate-700">
              Nouvel utilisateur
            </span>
          </div>
        </div>
      </header>

      {/* CONTENT */}
      <section className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">
          Administration
        </p>

        <h1 className="mt-2 text-3xl font-bold text-slate-900">
          Créer un compte OnoSign
        </h1>

        <p className="mt-2 text-slate-500">
          Créez un compte générique pour un hôtel, un département du siège ou SARH. Chaque compte accède uniquement à son espace OnoSign.
        </p>

        {/* INFORMATIONS */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">
            Informations du compte générique
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Informations principales du compte
            OnoSign.
          </p>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {/* NOM */}
            <div>
              <label className="text-sm font-semibold text-slate-700">
                Nom complet *
              </label>

              <input
                type="text"
                value={fullName}
                onChange={(e) =>
                  setFullName(e.target.value)
                }
                placeholder="Ex. Ahmed Benali"
                autoComplete="off"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
              />
            </div>

            {/* EMAIL */}
            <div>
              <label className="text-sm font-semibold text-slate-700">
                Email professionnel *
              </label>

              <input
                type="email"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                placeholder="nom@onomohotel.com"
                autoComplete="off"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
              />
            </div>

            {/* FONCTION */}
            <div>
              <label className="text-sm font-semibold text-slate-700">
                Fonction
              </label>

              <input
                type="text"
                value={jobTitle}
                onChange={(e) =>
                  setJobTitle(e.target.value)
                }
                placeholder="Ex. Directeur Général"
                autoComplete="off"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
              />
            </div>

            {/* DEPARTEMENT */}
            <div>
              <label className="text-sm font-semibold text-slate-700">
                Département
              </label>

              <input
                type="text"
                value={department}
                onChange={(e) =>
                  setDepartment(e.target.value)
                }
                placeholder="Ex. Finance, IT, RH..."
                autoComplete="off"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
              />
            </div>

            {/* PASSWORD */}
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-slate-700">
                Mot de passe temporaire *
              </label>

              <input
                type="password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                placeholder="Minimum 8 caractères"
                autoComplete="new-password"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
              />

              <p className="mt-2 text-xs text-slate-400">
                Ce mot de passe sera utilisé pour
                la première connexion.
              </p>
            </div>
          </div>
        </div>

        {/* RATTACHEMENT PRINCIPAL */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">
            Espace OnoSign
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Sélectionnez l’établissement principal
            du collaborateur.
          </p>

          <div className="mt-6">
            <label className="text-sm font-semibold text-slate-700">
              Hôtel, département du siège ou SARH *
            </label>

            <select
              value={primaryWorkspaceId}
              onChange={(e) => {
                setPrimaryWorkspaceId(
                  e.target.value
                );

                setPrimaryDepartmentId("");
              }}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
            >
              <option value="">
                Sélectionner un établissement
              </option>

             {workspaces
  .filter(
    (workspace) =>
      workspace.type === "hotel" ||
      workspace.type === "head_office_department" ||
      workspace.type === "sarh"
  )
  .map((workspace) => (
    <option
      key={workspace.id}
      value={workspace.id}
    >
      {workspace.type === "hotel"
        ? "🏨 "
        : workspace.type === "head_office_department"
        ? "🏢 "
        : "👥 "}
      {workspace.name}
    </option>
  ))}
            </select>
          </div>

         
    
        </div>
        {/* ROLE ONOSIGN */}
<div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
  <h2 className="text-lg font-bold text-slate-900">
    Rôle OnoSign
  </h2>

  <p className="mt-1 text-sm text-slate-500">
    Définissez les droits de cet utilisateur dans OnoSign.
  </p>

<div className="mt-6 rounded-xl border border-emerald-500 bg-emerald-50 p-5">
  <div className="flex items-start justify-between gap-4">
    <div>
      <p className="font-bold text-slate-900">
        Compte générique OnoSign
      </p>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        Ce compte permet aux collaborateurs d'un hôtel,
        d'un département du siège ou de SARH d'accéder
        uniquement à leur espace OnoSign.
      </p>

      <p className="mt-3 text-sm font-semibold text-emerald-700">
        Accès limité à un seul espace.
      </p>
    </div>

    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
      ✓
    </div>
    </div>
</div>
</div>

{/* ACTIONS */}
<div className="mt-8">
  {errorMessage && (
    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
      <p className="text-sm font-medium text-red-700">
        {errorMessage}
      </p>
    </div>
  )}

  {successMessage && (
    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
      <p className="text-sm font-medium text-emerald-700">
        {successMessage}
      </p>
    </div>
  )}

  <div className="flex items-center justify-end gap-3">
    <button
      type="button"
      onClick={() => router.push("/admin/users")}
      disabled={saving}
      className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50"
    >
      Annuler
    </button>

    <button
      type="button"
      onClick={handleCreateUser}
      disabled={saving}
      className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
    >
      {saving ? "Création en cours..." : "Créer le compte"}
    </button>
  </div>
</div>

      </section>
    </main>
  );
}