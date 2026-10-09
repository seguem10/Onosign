"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type UserProfile = {
  id: string;
  full_name: string | null;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  country_code: string | null;
  preferred_language: string | null;
  is_active: boolean;
  primary_workspace_id: string | null;
primary_department_id: string | null;
};

type WorkspaceAccess = {
  workspace_id: string;
  role: "owner" | "admin" | "member";
  workspaces: {
    id: string;
    name: string;
    type: string;
    parent_workspace_id: string | null;
    country_code: string | null;
  } | null;
};

export default function AdminUserDetailPage() {
  const router = useRouter();
  const params = useParams();

  const userId = params.id as string;

  const [user, setUser] =
    useState<UserProfile | null>(null);

  const [workspaceAccesses, setWorkspaceAccesses] =
    useState<WorkspaceAccess[]>([]);
    const primaryWorkspace = workspaceAccesses.find(
  (access) =>
    access.workspace_id === user?.primary_workspace_id
);

const primaryDepartment = workspaceAccesses.find(
  (access) =>
    access.workspace_id === user?.primary_department_id
);

const additionalAccesses = workspaceAccesses.filter(
  (access) =>
    access.workspace_id !== user?.primary_workspace_id &&
    access.workspace_id !== user?.primary_department_id
);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] =
    useState("");

  useEffect(() => {
    const supabase = createClient();

    async function loadUser() {
      setLoading(true);
      setErrorMessage("");

      // Charger le profil
      const { data, error } = await supabase
        .from("profiles")
        .select(`
  id,
  full_name,
  job_title,
  department,
  phone,
  country_code,
  preferred_language,
  is_active,
  primary_workspace_id,
  primary_department_id
`)
        .eq("id", userId)
        .single();

      if (error) {
        console.error(
          "Unable to load user:",
          error
        );

        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      setUser(data as UserProfile);

      // Charger les accès OnoSign
      const {
        data: accesses,
        error: accessesError,
      } = await supabase
        .from("workspace_members")
        .select(`
          workspace_id,
          role,
          workspaces (
            id,
            name,
            type,
            parent_workspace_id,
            country_code
          )
        `)
        .eq("user_id", userId);

      if (accessesError) {
        console.error(
          "Unable to load workspace accesses:",
          accessesError
        );
      } else {
        setWorkspaceAccesses(
          (accesses || []) as unknown as WorkspaceAccess[]
        );
      }

      setLoading(false);
    }

    if (userId) {
      loadUser();
    }
  }, [userId]);

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
              Détail utilisateur
            </span>
          </div>
        </div>
      </header>

      {/* CONTENT */}
      <section className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">
          Administration
        </p>

       <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
  <h1 className="text-3xl font-bold text-slate-900">
    Utilisateur
  </h1>

  <button
    type="button"
    onClick={() =>
      router.push(`/admin/users/${userId}/edit`)
    }
    disabled={loading || !user}
    className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
  >
    ✏️ Modifier l’utilisateur
  </button>
</div>

        {/* LOADING */}
        {loading && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-slate-500">
              Chargement de l’utilisateur...
            </p>
          </div>
        )}

        {/* ERROR */}
        {!loading && errorMessage && (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6">
            <p className="font-semibold text-red-700">
              Impossible de charger l’utilisateur
            </p>

            <p className="mt-2 text-sm text-red-600">
              {errorMessage}
            </p>
          </div>
        )}

        {/* USER */}
        {!loading &&
          !errorMessage &&
          user && (
            <>
              {/* PROFIL */}
              <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xl font-bold text-emerald-700">
                      {(user.full_name || "U")
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <div>
                      <h2 className="text-xl font-bold text-slate-900">
                        {user.full_name ||
                          "Utilisateur sans nom"}
                      </h2>

                      <p className="mt-1 text-sm text-slate-500">
                        {user.job_title ||
                          "Fonction non renseignée"}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      user.is_active
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {user.is_active
                      ? "Actif"
                      : "Inactif"}
                  </span>
                </div>

                <div className="mt-8 grid gap-5 border-t border-slate-100 pt-6 md:grid-cols-2">
                  {/* FONCTION */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Fonction
                    </p>

                    <p className="mt-2 font-medium text-slate-800">
                      {user.job_title ||
                        "Non renseignée"}
                    </p>
                  </div>

                  {/* DEPARTEMENT */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Département
                    </p>

                    <p className="mt-2 font-medium text-slate-800">
                      {user.department ||
                        "Non renseigné"}
                    </p>
                  </div>

                  {/* PAYS */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Pays
                    </p>

                    <p className="mt-2 font-medium uppercase text-slate-800">
                      {user.country_code || "—"}
                    </p>
                  </div>

                  {/* LANGUE */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Langue
                    </p>

                    <p className="mt-2 font-medium uppercase text-slate-800">
                      {user.preferred_language ||
                        "—"}
                    </p>
                  </div>

                  {/* TELEPHONE */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Téléphone
                    </p>

                    <p className="mt-2 font-medium text-slate-800">
                      {user.phone ||
                        "Non renseigné"}
                    </p>
                  </div>

                  {/* ID */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      ID OnoSign
                    </p>

                    <p className="mt-2 break-all font-mono text-xs text-slate-500">
                      {user.id}
                    </p>
                  </div>
                </div>
              </div>
{/* ETABLISSEMENT PRINCIPAL */}
<div className="mt-6 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
  <div className="flex items-center justify-between">
    <h2 className="text-lg font-bold text-slate-900">
      Établissement principal
    </h2>

    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
      Principal
    </span>
  </div>

  <div className="mt-5 rounded-xl bg-slate-50 p-5">
    <p className="text-lg font-bold text-slate-900">
      {primaryWorkspace?.workspaces?.name ||
        "Non renseigné"}
    </p>

    <p className="mt-1 text-sm text-slate-500">
      {primaryWorkspace?.workspaces?.type === "hotel"
        ? "Hôtel"
        : primaryWorkspace?.workspaces?.type === "head_office"
          ? "Siège"
          : "Établissement"}
    </p>

    {primaryDepartment && (
      <p className="mt-3 text-sm text-slate-600">
        Département principal :{" "}
        <span className="font-semibold">
          {primaryDepartment.workspaces?.name}
        </span>
      </p>
    )}
  </div>
</div>
              {/* ACCES ONOSIGN */}
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Accès OnoSign
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      Établissements, départements et
                      niveau d’accès de cet utilisateur.
                    </p>
                  </div>

                 {additionalAccesses.length > 0 && (
  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
    {additionalAccesses.length} accès
  </span>
)}
</div>

{additionalAccesses.length === 0 ? (
  <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center">
    <p className="text-sm text-slate-500">
      Aucun accès supplémentaire attribué.
    </p>
  </div>
) : (
                  <div className="mt-6 space-y-3">
                   {additionalAccesses.map (
                      (access) => (
                        <div
                          key={
                            access.workspace_id
                          }
                          className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center"
                        >
                          <div>
                            <p className="font-semibold text-slate-900">
                              {access
                                .workspaces
                                ?.name ||
                                "Établissement inconnu"}
                            </p>

                            <p className="mt-1 text-sm text-slate-500">
                              {access
                                .workspaces
                                ?.type ===
                              "hotel"
                                ? "Hôtel"
                                : access
                                      .workspaces
                                      ?.type ===
                                    "head_office"
                                  ? "Siège"
                                  : access
                                        .workspaces
                                        ?.type ===
                                      "head_office_department"
                                    ? "Département du siège"
                                    : "Espace OnoSign"}
                            </p>
                          </div>

                          <span
                            className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                              access.role ===
                                "admin" ||
                              access.role ===
                                "owner"
                                ? "bg-violet-50 text-violet-700"
                                : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {access.role ===
                            "owner"
                              ? "Propriétaire"
                              : access.role ===
                                  "admin"
                                ? "Administrateur"
                                : "Collaborateur"}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </>
          )}
      </section>
    </main>
  );
}