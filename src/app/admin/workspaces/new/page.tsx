"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type WorkspaceType =
  | "hotel"
  | "head_office"
  | "head_office_department";

type HeadOffice = {
  id: string;
  name: string;
};

export default function NewWorkspacePage() {
  const router = useRouter();

  const [type, setType] =
    useState<WorkspaceType>("hotel");

  const [name, setName] = useState("");
  const [countryCode, setCountryCode] =
    useState("MA");

  const [headOffices, setHeadOffices] =
    useState<HeadOffice[]>([]);

  const [
    parentWorkspaceId,
    setParentWorkspaceId,
  ] = useState("");

  const [saving, setSaving] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  /*
   * Charge uniquement les sièges.
   * Ils seront proposés comme parent lors
   * de la création d'un département du siège.
   */
  useEffect(() => {
    const supabase = createClient();

    async function loadHeadOffices() {
      const { data, error } =
        await supabase
          .from("workspaces")
          .select("id, name")
          .eq("type", "head_office")
          .eq("is_active", true)
          .order("name");

      if (error) {
        console.error(
          "Unable to load head offices:",
          error
        );
        return;
      }

      const offices = data || [];

      setHeadOffices(offices);

      if (offices.length > 0) {
        setParentWorkspaceId(
          offices[0].id
        );
      }
    }

    loadHeadOffices();
  }, []);

  /*
   * Création d'un hôtel, siège
   * ou département du siège.
   */
  async function createWorkspace() {
    if (saving) {
      return;
    }

    if (!name.trim()) {
      setErrorMessage(
        "Le nom est obligatoire."
      );
      return;
    }

    if (!countryCode.trim()) {
      setErrorMessage(
        "Le pays est obligatoire."
      );
      return;
    }

    if (
      type ===
        "head_office_department" &&
      !parentWorkspaceId
    ) {
      setErrorMessage(
        "Veuillez sélectionner le siège parent."
      );
      return;
    }

    setSaving(true);
    setErrorMessage("");

    const supabase = createClient();

    try {
      /*
       * 1. Utilisateur connecté
       */
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(
          "Impossible d'identifier l'utilisateur connecté."
        );
      }

      /*
       * 2. Organisation ONOMO
       */
      const {
        data: membership,
        error: membershipError,
      } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (
        membershipError ||
        !membership
      ) {
        console.error(
          "Organization membership error:",
          membershipError
        );

        throw new Error(
          "Impossible de trouver votre organisation."
        );
      }

      /*
       * 3. Création du workspace
       */
      const {
        data: createdWorkspace,
        error: workspaceError,
      } = await supabase
        .from("workspaces")
        .insert({
          organization_id:
            membership.organization_id,

          name: name.trim(),

          type,

          country_code:
            countryCode
              .trim()
              .toUpperCase(),

          parent_workspace_id:
            type ===
            "head_office_department"
              ? parentWorkspaceId
              : null,

          is_active: true,
        })
        .select("id")
        .single();

      if (
        workspaceError ||
        !createdWorkspace
      ) {
        console.error(
          "Workspace creation error:",
          workspaceError
        );

        throw new Error(
          workspaceError?.message ||
            "Impossible de créer l'établissement."
        );
      }

      /*
       * 4. Le créateur devient owner
       * du nouvel établissement.
       */
      const {
        error: memberError,
      } = await supabase
        .from("workspace_members")
        .insert({
          workspace_id:
            createdWorkspace.id,

          user_id: user.id,

          role: "owner",
        });

      if (memberError) {
        console.error(
          "Workspace membership error:",
          memberError
        );

        throw new Error(
          `L'établissement a été créé, mais l'attribution de l'administrateur a échoué : ${memberError.message}`
        );
      }

      /*
       * 5. Retour à la liste
       */
      router.push(
        "/admin/workspaces"
      );

      router.refresh();
    } catch (error) {
      console.error(
        "Create workspace error:",
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Une erreur inattendue est survenue."
      );

      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      {/* HEADER */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <button
            type="button"
            onClick={() =>
              router.push(
                "/admin/workspaces"
              )
            }
            className="text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            ← Hôtels & Siège
          </button>

          <div className="mt-4 flex items-center gap-3">
            <span className="text-2xl font-bold text-emerald-600">
              OnoSign
            </span>

            <span className="text-slate-300">
              /
            </span>

            <span className="font-semibold text-slate-700">
              Nouvel établissement
            </span>
          </div>
        </div>
      </header>

      {/* CONTENT */}
      <section className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-bold text-slate-900">
          Ajouter un établissement
        </h1>

        <p className="mt-2 text-slate-500">
          Créez un hôtel, le siège ou un
          département du siège.
        </p>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          {/* TYPE */}
          <label className="block text-sm font-semibold text-slate-700">
            Type
          </label>

          <select
            value={type}
            onChange={(event) => {
              const newType =
                event.target
                  .value as WorkspaceType;

              setType(newType);
              setErrorMessage("");

              if (
                newType ===
                  "head_office_department" &&
                !parentWorkspaceId &&
                headOffices.length > 0
              ) {
                setParentWorkspaceId(
                  headOffices[0].id
                );
              }
            }}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
          >
            <option value="hotel">
              Hôtel
            </option>

            <option value="head_office">
              Siège
            </option>

            <option value="head_office_department">
              Département du siège
            </option>
          </select>

          {/* NAME */}
          <label className="mt-6 block text-sm font-semibold text-slate-700">
            Nom
          </label>

          <input
            type="text"
            value={name}
            onChange={(event) => {
              setName(
                event.target.value
              );

              if (errorMessage) {
                setErrorMessage("");
              }
            }}
            placeholder={
              type === "hotel"
                ? "Ex : ONOMO Marrakech"
                : type ===
                    "head_office"
                  ? "Ex : SIÈGE ONOMO HOTELS"
                  : "Ex : Finance"
            }
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
          />

          {/* COUNTRY */}
          <label className="mt-6 block text-sm font-semibold text-slate-700">
            Pays
          </label>

          <input
            type="text"
            value={countryCode}
            onChange={(event) =>
              setCountryCode(
                event.target.value.toUpperCase()
              )
            }
            maxLength={2}
            placeholder="MA"
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 uppercase outline-none focus:border-emerald-500"
          />

          {/* PARENT HEAD OFFICE */}
          {type ===
            "head_office_department" && (
            <div className="mt-6">
              <label className="block text-sm font-semibold text-slate-700">
                Siège parent
              </label>

              {headOffices.length >
              0 ? (
                <select
                  value={
                    parentWorkspaceId
                  }
                  onChange={(event) =>
                    setParentWorkspaceId(
                      event.target.value
                    )
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
                >
                  {headOffices.map(
                    (office) => (
                      <option
                        key={
                          office.id
                        }
                        value={
                          office.id
                        }
                      >
                        {
                          office.name
                        }
                      </option>
                    )
                  )}
                </select>
              ) : (
                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-amber-700">
                    Aucun siège actif
                    disponible. Créez
                    d'abord un siège.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ERROR */}
          {errorMessage && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-700">
                {errorMessage}
              </p>
            </div>
          )}

          {/* BUTTONS */}
          <div className="mt-8 flex justify-end gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                router.push(
                  "/admin/workspaces"
                )
              }
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Annuler
            </button>

            <button
              type="button"
              onClick={
                createWorkspace
              }
              disabled={
                saving ||
                !name.trim() ||
                !countryCode.trim() ||
                (type ===
                  "head_office_department" &&
                  !parentWorkspaceId)
              }
              className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving
                ? "Création..."
                : "Créer l'établissement"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}