"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase";

export default function SignUpPage() {
  const supabase = createClient();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setSuccess(false);

    if (password.length < 8) {
      setMessage("Password must contain at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          country_code: "MA",
          preferred_language: "fr",
        },
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setMessage(
      "Account created. Check your email to confirm your Onosign account."
    );
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="grid min-h-screen lg:grid-cols-2">

        <section className="hidden bg-slate-900 p-16 lg:flex lg:flex-col lg:justify-between">
          <div className="text-3xl font-bold">
            Ono<span className="text-emerald-400">sign</span>
          </div>

          <div className="max-w-xl">
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.25em] text-emerald-400">
              Secure signatures. Built for Africa.
            </p>

            <h1 className="text-5xl font-bold leading-tight">
              Your agreements.
              <br />
              One secure platform.
            </h1>

            <p className="mt-6 text-lg text-slate-400">
              Create your organization and start managing electronic
              signatures securely.
            </p>
          </div>

          <p className="text-sm text-slate-500">
            © 2026 Onosign
          </p>
        </section>

        <section className="flex items-center justify-center bg-white px-6 py-12 text-slate-900">
          <div className="w-full max-w-md">

            <div className="mb-8 lg:hidden">
              <div className="text-3xl font-bold">
                Ono<span className="text-emerald-600">sign</span>
              </div>
            </div>

            <p className="text-sm font-semibold text-emerald-600">
              CREATE ACCOUNT
            </p>

            <h2 className="mt-2 text-3xl font-bold">
              Get started with Onosign
            </h2>

            <p className="mt-2 text-slate-500">
              Create your secure workspace.
            </p>

            <form onSubmit={signUp} className="mt-8 space-y-4">

              <div>
                <label
                  htmlFor="fullName"
                  className="mb-2 block text-sm font-medium"
                >
                  Full name
                </label>

                <input
                  id="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-600"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-medium"
                >
                  Business email
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
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-600"
                />
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="mb-2 block text-sm font-medium"
                >
                  Confirm password
                </label>

                <input
                  id="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-600"
                />
              </div>

              {message && (
                <div
                  className={`rounded-xl p-3 text-sm ${
                    success
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {loading ? "Creating account..." : "Create account"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              Already have an account?{" "}
              <Link
                href="/"
                className="font-semibold text-emerald-700"
              >
                Sign in
              </Link>
            </p>

          </div>
        </section>

      </div>
    </main>
  );
}