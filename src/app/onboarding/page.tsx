"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [organizationName, setOrganizationName] = useState("");
  const [country, setCountry] = useState("MA");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  function createSlug(value: string) {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    const {
  data: { session },
} = await supabase.auth.getSession();

if (!session) {
  setMessage("Your session has expired. Please sign in again.");
  setLoading(false);
  router.push("/");
  return;
}

    setLoading(true);
    setMessage("");

    const slug = createSlug(organizationName);

    if (!slug) {
      setMessage("Please enter a valid organization name.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.rpc("create_organization", {
      organization_name: organizationName,
      organization_slug: slug,
      organization_country: country,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6 py-12">

        <div className="w-full max-w-xl">

          <div className="mb-10 text-center">
            <div className="text-3xl font-bold text-slate-950">
              Ono<span className="text-emerald-600">sign</span>
            </div>

            <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
              Workspace setup
            </p>

            <h1 className="mt-3 text-4xl font-bold text-slate-950">
              Create your organization
            </h1>

            <p className="mt-3 text-slate-500">
              Your documents, team members and signatures will be managed
              inside this secure workspace.
            </p>
          </div>

          <form
            onSubmit={createWorkspace}
            className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"
          >
            <div>
              <label
                htmlFor="organization"
                className="mb-2 block text-sm font-medium text-slate-900"
              >
                Organization name
              </label>

              <input
                id="organization"
                type="text"
                required
                minLength={2}
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="Example: Onomo Hotels"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-600"
              />
            </div>

            <div className="mt-5">
              <label
                htmlFor="country"
                className="mb-2 block text-sm font-medium text-slate-900"
              >
                Country
              </label>

              <select
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-600"
              >
                <option value="MA">Morocco</option>
                <option value="SN">Senegal</option>
                <option value="CI">Côte d'Ivoire</option>
                <option value="CM">Cameroon</option>
                <option value="TN">Tunisia</option>
                <option value="DZ">Algeria</option>
              </select>
            </div>

            {message && (
              <div className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-7 w-full rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? "Creating workspace..." : "Create workspace"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            Onosign • Secure signatures. Built for Africa.
          </p>

        </div>
      </div>
    </main>
  );
}