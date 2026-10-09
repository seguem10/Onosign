
"use client";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function signIn(e: React.FormEvent) {
  e.preventDefault();
  setLoading(true);
  setMessage("");

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    setMessage(error.message);
    setLoading(false);
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    setMessage("Unable to load your account.");
    setLoading(false);
    return;
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    setMessage(membershipError.message);
    setLoading(false);
    return;
  }

  if (membership) {
    router.push("/dashboard");
  } else {
    router.push("/onboarding");
  }

  router.refresh();
  setLoading(false);
}
  

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="grid min-h-screen lg:grid-cols-2">

        {/* Partie gauche */}
        <section className="hidden lg:flex flex-col justify-between p-16 bg-slate-900">
          <div>
            <div className="text-3xl font-bold">
              Ono<span className="text-emerald-400">sign</span>
            </div>
          </div>

          <div className="max-w-xl">
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.25em] text-emerald-400">
              Secure signatures. Built for ONOMO
            </p>

            <h1 className="text-5xl font-bold leading-tight">
              Sign documents.
              <br />
              Anywhere
            </h1>

            <p className="mt-6 text-lg text-slate-400">
              Send, sign and manage your agreements securely from one
              platform.
            </p>
          </div>

          <p className="text-sm text-slate-500">
            © 2026 Onosign
          </p>
        </section>

        {/* Connexion */}
        <section className="flex items-center justify-center bg-white px-6 text-slate-900">
          <div className="w-full max-w-md">

            <div className="mb-10 lg:hidden">
              <div className="text-3xl font-bold">
                Ono<span className="text-emerald-600">sign</span>
              </div>
            </div>

            <p className="text-sm font-semibold text-emerald-600">
              ONOSIGN
            </p>

            <h2 className="mt-2 text-3xl font-bold">
              Welcome back
            </h2>

            <p className="mt-2 text-slate-500">
              Sign in to manage your documents.
            </p>

            <form onSubmit={signIn} className="mt-8 space-y-5">

              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-medium"
                >
                  Email address
                </label>

                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-600"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-medium"
                >
                  Password
                </label>

                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-600"
                />
              </div>

              {message && (
                <div className="rounded-lg bg-slate-100 p-3 text-sm">
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>

            </form>

            <div className="mt-8 border-t border-slate-200 pt-6 text-center text-sm text-slate-500">
              Don't have an Onosign account?
              <Link
  href="/signup"
  className="ml-1 font-semibold text-emerald-700 hover:underline"
>
  Create account
</Link>
            </div>

            <div className="mt-10 flex justify-center gap-5 text-xs text-slate-400">
              <span>English</span>
              <span>Français</span>
              <span>العربية</span>
            </div>

          </div>
        </section>

      </div>
    </main>
  );
}