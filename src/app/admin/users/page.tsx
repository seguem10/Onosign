"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
};

export default function AdminUsersPage() {
  const router = useRouter();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const supabase = createClient();

    async function loadUsers() {
      setLoading(true);
      setErrorMessage("");
            // Vérifier l'utilisateur connecté
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace("/");
        return;
      }

      // Vérifier les droits d'administration
      const { data: membership, error: membershipError } =
        await supabase
          .from("organization_members")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

      if (
        membershipError ||
        !membership ||
        !["owner", "admin"].includes(membership.role)
      ) {
        router.replace("/dashboard");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select(
          `
          id,
          full_name,
          job_title,
          department,
          phone,
          country_code,
          preferred_language,
          is_active
          `
        )
        .order("full_name", {
          ascending: true,
        });

      if (error) {
        console.error("Unable to load users:", error);
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      setUsers((data || []) as UserProfile[]);
      setLoading(false);
    }

    loadUsers();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50">
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
              Utilisateurs
            </span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">
              Administration
            </p>

            <h1 className="mt-2 text-3xl font-bold text-slate-900">
              Utilisateurs
            </h1>

            <p className="mt-2 text-slate-500">
              Gérez les collaborateurs, leurs fonctions et leurs
              accès aux établissements OnoSign.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/admin/users/new")}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            + Ajouter un utilisateur
          </button>
        </div>

        {loading && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8">
            <p className="text-slate-500">
              Chargement des utilisateurs...
            </p>
          </div>
        )}

        {!loading && errorMessage && (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6">
            <p className="font-semibold text-red-700">
              Impossible de charger les utilisateurs
            </p>

            <p className="mt-2 text-sm text-red-600">
              {errorMessage}
            </p>
          </div>
        )}

        {!loading && !errorMessage && (
          <>
            <div className="mt-8 flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {users.length} utilisateur
                {users.length !== 1 ? "s" : ""}
              </p>
            </div>

            {users.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <div className="text-3xl">👥</div>

                <h2 className="mt-3 font-bold text-slate-900">
                  Aucun utilisateur
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Ajoutez votre premier collaborateur OnoSign.
                </p>
              </div>
            ) : (
              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="hidden grid-cols-[2fr_1.3fr_1.3fr_0.7fr_0.5fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 md:grid">
                  <div>Utilisateur</div>
                  <div>Fonction</div>
                  <div>Département</div>
                  <div>Pays</div>
                  <div>Statut</div>
                </div>

                {users.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() =>
                      router.push(`/admin/users/${user.id}`)
                    }
                    className="grid w-full gap-4 border-b border-slate-100 px-6 py-5 text-left transition last:border-b-0 hover:bg-slate-50 md:grid-cols-[2fr_1.3fr_1.3fr_0.7fr_0.5fr] md:items-center"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 font-bold text-emerald-700">
                        {(user.full_name || "U")
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">
                          {user.full_name ||
                            "Utilisateur sans nom"}
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          {user.id.slice(0, 8)}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-slate-700">
                        {user.job_title || "Non renseignée"}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-700">
                        {user.department || "Non renseigné"}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-medium uppercase text-slate-500">
                        {user.country_code || "—"}
                      </p>
                    </div>

                    <div>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          user.is_active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {user.is_active ? "Actif" : "Inactif"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}