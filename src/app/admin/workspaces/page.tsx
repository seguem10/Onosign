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
  is_active: boolean;
};

export default function AdminWorkspacesPage() {
  const router = useRouter();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const supabase = createClient();

    async function loadWorkspaces() {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("workspaces")
        .select(
          "id, name, type, parent_workspace_id, country_code, is_active"
        )
        .order("name", {
          ascending: true,
        });

      if (error) {
        console.error("Unable to load workspaces:", error);
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      setWorkspaces((data || []) as Workspace[]);
      setLoading(false);
    }

    loadWorkspaces();
  }, []);

  const hotels = workspaces.filter(
    (workspace) => workspace.type === "hotel"
  );

  const headOffices = workspaces.filter(
    (workspace) => workspace.type === "head_office"
  );

  const departments = workspaces.filter(
    (workspace) =>
      workspace.type === "head_office_department"
  );
  const sarhWorkspaces = workspaces.filter(
  (workspace) => workspace.type === "sarh"
);

  function StatusBadge({
    active,
  }: {
    active: boolean;
  }) {
    return (
      <span
        className={`rounded-full px-3 py-1 text-xs font-semibold ${
          active
            ? "bg-emerald-50 text-emerald-700"
            : "bg-slate-100 text-slate-500"
        }`}
      >
        {active ? "Actif" : "Inactif"}
      </span>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      {/* HEADER */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            ← Administration
          </button>

          <div className="mt-4 flex items-center gap-3">
            <span className="text-2xl font-bold text-emerald-600">
              OnoSign
            </span>

            <span className="text-slate-300">/</span>

            <span className="font-semibold text-slate-700">
              Hôtels & Siège
            </span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-10">
        {/* TITLE */}
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Hôtels & Siège
            </h1>

            <p className="mt-2 text-slate-500">
              Gérez les hôtels ONOMO, le siège et ses départements.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push("/admin/workspaces/new")
            }
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            + Ajouter un établissement
          </button>
        </div>

        {/* LOADING */}
        {loading && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8">
            <p className="text-slate-500">
              Chargement des établissements OnoSign...
            </p>
          </div>
        )}

        {/* ERROR */}
        {!loading && errorMessage && (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6">
            <p className="font-semibold text-red-700">
              Impossible de charger les établissements
            </p>

            <p className="mt-2 text-sm text-red-600">
              {errorMessage}
            </p>
          </div>
        )}

        {!loading && !errorMessage && (
          <>
            {/* ================= HOTELS ================= */}

            <section className="mt-10">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">
                    Établissements
                  </p>

                  <h2 className="mt-1 text-2xl font-bold text-slate-900">
                    Hôtels
                  </h2>
                </div>

                <span className="rounded-full bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-600">
                  {hotels.length}
                </span>
              </div>

              {hotels.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                  <p className="text-slate-500">
                    Aucun hôtel configuré.
                  </p>
                </div>
              ) : (
                <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {hotels.map((hotel) => (
                    <div
                      key={hotel.id}
                      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-2xl">
                          🏨
                        </div>

                        <StatusBadge
                          active={hotel.is_active}
                        />
                      </div>

                      <h3 className="mt-5 text-lg font-bold text-slate-900">
                        {hotel.name}
                      </h3>

                      <p className="mt-1 text-sm text-slate-500">
                        Hôtel
                      </p>

                      {hotel.country_code && (
                        <p className="mt-4 text-xs font-semibold uppercase text-slate-400">
                          {hotel.country_code}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ================= HEAD OFFICE ================= */}

            <section className="mt-14">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">
                    Administration centrale
                  </p>

                  <h2 className="mt-1 text-2xl font-bold text-slate-900">
                    Siège
                  </h2>
                </div>

                <span className="rounded-full bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-600">
                  {headOffices.length}
                </span>
              </div>

              {headOffices.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                  <p className="text-slate-500">
                    Aucun siège configuré.
                  </p>
                </div>
              ) : (
                <div className="mt-5 space-y-6">
                  {headOffices.map((office) => {
                    const officeDepartments =
                      departments.filter(
                        (department) =>
                          department.parent_workspace_id ===
                          office.id
                      );

                    return (
                      <div
                        key={office.id}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                      >
                        {/* HEAD OFFICE CARD */}

                        <div className="flex flex-col justify-between gap-5 p-6 md:flex-row md:items-center">
                          <div className="flex items-center gap-4">
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-50 text-2xl">
                              🏢
                            </div>

                            <div>
                              <div className="flex items-center gap-3">
                                <h3 className="text-xl font-bold text-slate-900">
                                  {office.name}
                                </h3>

                                <StatusBadge
                                  active={office.is_active}
                                />
                              </div>

                              <p className="mt-1 text-sm text-slate-500">
                                Siège
                                {office.country_code
                                  ? ` · ${office.country_code}`
                                  : ""}
                              </p>
                            </div>
                          </div>

                          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
                            <span className="font-bold text-slate-900">
                              {officeDepartments.length}
                            </span>

                            <span className="ml-2 text-slate-500">
                              département
                              {officeDepartments.length !== 1
                                ? "s"
                                : ""}
                            </span>
                          </div>
                        </div>

                        {/* DEPARTMENTS */}

                        <div className="border-t border-slate-200 bg-slate-50 p-6">
                          <div className="mb-4">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                              Départements du siège
                            </p>
                          </div>

                          {officeDepartments.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5">
                              <p className="text-sm text-slate-500">
                                Aucun département rattaché à ce siège.
                              </p>
                            </div>
                          ) : (
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                              {officeDepartments.map(
                                (department) => (
                                  <div
                                    key={department.id}
                                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
                                  >
                                    <div className="flex min-w-0 items-center gap-3">
                                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                                        🏢
                                      </div>

                                      <div className="min-w-0">
                                        <p className="truncate font-semibold text-slate-900">
                                          {department.name}
                                        </p>

                                        <p className="mt-0.5 text-xs text-slate-500">
                                          Département
                                        </p>
                                      </div>
                                    </div>

                                    <StatusBadge
                                      active={
                                        department.is_active
                                      }
                                    />
                                  </div>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ORPHAN DEPARTMENTS */}

            {departments.filter(
              (department) =>
                !headOffices.some(
                  (office) =>
                    office.id ===
                    department.parent_workspace_id
                )
            ).length > 0 && (
              <section className="mt-10">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
                  <h2 className="font-bold text-amber-900">
                    Départements non rattachés
                  </h2>

                  <p className="mt-1 text-sm text-amber-700">
                    Ces départements ne sont actuellement rattachés
                    à aucun siège.
                  </p>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {departments
                      .filter(
                        (department) =>
                          !headOffices.some(
                            (office) =>
                              office.id ===
                              department.parent_workspace_id
                          )
                      )
                      .map((department) => (
                        <div
                          key={department.id}
                          className="rounded-xl border border-amber-200 bg-white p-4"
                        >
                          <p className="font-semibold text-slate-900">
                            {department.name}
                          </p>

                          <p className="mt-1 text-xs text-amber-700">
                            Aucun siège parent
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              </section>
            )}
          </>
        )}
        {/* ESPACE INDÉPENDANT SARH */}
{sarhWorkspaces.length > 0 && (
  <section className="mt-12">
    <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">
          Espace indépendant
        </p>

        <h2 className="mt-2 text-2xl font-bold text-slate-900">
          SARH
        </h2>
      </div>

      <span className="rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
        {sarhWorkspaces.length}
      </span>
    </div>

    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {sarhWorkspaces.map((workspace) => (
        <div
          key={workspace.id}
          className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
        >
          <div className="flex items-start justify-between">
            <div className="rounded-xl bg-emerald-50 p-4 text-2xl">
              👥
            </div>

            <StatusBadge active={workspace.is_active} />
          </div>

          <h3 className="mt-6 text-xl font-bold text-slate-900">
            {workspace.name}
          </h3>

          <p className="mt-2 text-sm text-slate-500">
            Espace indépendant SARH
          </p>

          <p className="mt-5 text-xs font-semibold uppercase text-slate-400">
            ONOMO HOTELS
          </p>
        </div>
      ))}
    </div>
  </section>
)}
      </section>
    </main>
  );
}