"use client";

import { useRouter } from "next/navigation";

const modules = [
  {
    title: "Hôtels & Siège",
    description:
      "Créer et gérer les hôtels, le siège et les départements.",
    icon: "🏨",
    href: "/admin/workspaces",
  },
  {
    title: "Utilisateurs",
    description:
      "Gérer les collaborateurs et leurs accès OnoSign.",
    icon: "👥",
    href: "/admin/users",
  },
  {
    title: "Rôles & Responsables",
    description:
      "Configurer DG, RAF, DAF, directeurs et autres responsables.",
    icon: "🛡️",
    href: "/admin/roles",
  },
  {
    title: "Modèles DI / DR",
    description:
      "Configurer les modèles PDF et les champs de signature.",
    icon: "📄",
    href: "/admin/templates",
  },
  {
    title: "Workflows",
    description:
      "Configurer l'ordre des signatures et les actions des destinataires.",
    icon: "🔀",
    href: "/admin/workflows",
  },
];

export default function AdminPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="mb-3 text-sm font-medium text-slate-500 hover:text-slate-900"
              >
                ← Back to dashboard
              </button>

              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-emerald-600">
                  OnoSign
                </span>

                <span className="text-slate-300">/</span>

                <span className="font-semibold text-slate-700">
                  Administration
                </span>
              </div>
            </div>

            <div className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
              ONOMO HOTELS
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-600">
            Administration
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Configuration OnoSign
          </h1>

          <p className="mt-2 max-w-3xl text-slate-500">
            Gérez les établissements, utilisateurs, responsables,
            modèles DI/DR et circuits de signature depuis un seul espace.
          </p>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => (
            <button
              key={module.title}
              type="button"
              onClick={() => router.push(module.href)}
              className="group rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-2xl">
                  {module.icon}
                </div>

                <span className="text-xl text-slate-300 transition group-hover:translate-x-1 group-hover:text-emerald-600">
                  →
                </span>
              </div>

              <h2 className="mt-5 text-lg font-bold text-slate-900">
                {module.title}
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                {module.description}
              </p>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}