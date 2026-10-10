"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Hotel = {
  workspace_id: string;
  hotel_name: string;
  country_code: string | null;
  member_count: number;
  has_members: boolean;
};

export default function HotelOnboardingPage() {
  const router = useRouter();
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const supabase = createClient();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !auth.user) {
        router.replace("/");
        return;
      }
      const { data, error: queryError } = await supabase.rpc("onosign_hotel_onboarding_status");
      if (!active) return;
      if (queryError) setError(queryError.message);
      else setHotels((data ?? []) as Hotel[]);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [router]);

  const withoutMembers = hotels.filter((hotel) => !hotel.has_members).length;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <button type="button" className="text-sm text-slate-600" onClick={() => router.push("/admin/templates")}>
          ← Administration
        </button>
        <h1 className="mt-6 text-3xl font-bold">Comptes et accès des hôtels</h1>
        <p className="mt-2 text-slate-600">
          Vérifiez les établissements sans collaborateurs affectés. Les comptes et les autorisations
          ne sont pas créés automatiquement.
        </p>
        {loading ? <p className="mt-8">Chargement…</p> : error ? (
          <p role="alert" className="mt-8 rounded-xl bg-red-50 p-5 text-red-700">{error}</p>
        ) : (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Hôtels</div><div className="text-3xl font-bold">{hotels.length}</div></div>
              <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Sans collaborateurs</div><div className="text-3xl font-bold text-amber-700">{withoutMembers}</div></div>
              <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Avec collaborateurs</div><div className="text-3xl font-bold">{hotels.length - withoutMembers}</div></div>
            </div>
            {hotels.length === 0 && <p className="mt-6 rounded-xl border bg-white p-5">Aucun hôtel visible. Vérifiez votre rôle administrateur.</p>}
            <div className="mt-8 overflow-x-auto rounded-xl border bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100"><tr><th className="p-4">Hôtel</th><th className="p-4">Pays</th><th className="p-4">Collaborateurs</th><th className="p-4">État</th></tr></thead>
                <tbody>{hotels.map((hotel) => (
                  <tr key={hotel.workspace_id} className="border-t">
                    <td className="p-4 font-medium">{hotel.hotel_name}</td>
                    <td className="p-4">{hotel.country_code ?? "—"}</td>
                    <td className="p-4">{hotel.member_count}</td>
                    <td className="p-4">{hotel.has_members ? "Affecté" : "À configurer"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <p className="mt-5 text-sm text-slate-500">
              Étape suivante : identifier les responsables de chaque hôtel, créer ou inviter leurs comptes,
              puis leur attribuer explicitement les droits nécessaires. Les rôles de signature DI / DR
              sont configurés séparément des rôles d’accès aux espaces.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
