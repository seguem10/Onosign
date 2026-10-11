"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type DirectoryUser = { user_id: string; full_name: string | null };

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
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [selectedHotel, setSelectedHotel] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState<"member" | "admin">("member");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

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
      const [{ data, error: queryError }, { data: users, error: directoryError }] = await Promise.all([
        supabase.rpc("onosign_hotel_onboarding_status"),
        supabase.rpc("onosign_hotel_user_directory"),
      ]);
      if (!active) return;
      if (queryError || directoryError) setError(queryError?.message ?? directoryError?.message ?? "Erreur");
      else {
        setHotels((data ?? []) as Hotel[]);
        setDirectory((users ?? []) as DirectoryUser[]);
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [router]);

  const withoutMembers = hotels.filter((hotel) => !hotel.has_members).length;

  async function assignMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedHotel || !selectedUser || saving) return;
    setSaving(true);
    setNotice("");
    const supabase = createClient();
    const { error: assignError } = await supabase.rpc("onosign_assign_hotel_member", {
      p_hotel: selectedHotel, p_member: selectedUser, p_role: selectedRole,
    });
    if (assignError) setNotice(assignError.message);
    else {
      setNotice("Collaborateur affecté à l’hôtel.");
      const { data } = await supabase.rpc("onosign_hotel_onboarding_status");
      if (data) setHotels(data as Hotel[]);
    }
    setSaving(false);
  }

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
            <form onSubmit={assignMember} className="mt-8 grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-4">
              <label className="text-sm font-semibold">Hôtel
                <select required value={selectedHotel} onChange={(e) => setSelectedHotel(e.target.value)} className="mt-2 w-full rounded-lg border p-2 font-normal">
                  <option value="">Sélectionner…</option>
                  {hotels.map((hotel) => <option key={hotel.workspace_id} value={hotel.workspace_id}>{hotel.hotel_name}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold">Compte existant
                <select required value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className="mt-2 w-full rounded-lg border p-2 font-normal">
                  <option value="">Sélectionner…</option>
                  {directory.map((user) => <option key={user.user_id} value={user.user_id}>{user.full_name || user.user_id}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold">Accès à l'hôtel
                <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as "member" | "admin")} className="mt-2 w-full rounded-lg border p-2 font-normal">
                  <option value="member">Collaborateur</option>
                  <option value="admin">Administrateur hôtel</option>
                </select>
              </label>
              <button type="submit" disabled={saving || !selectedHotel || !selectedUser} className="self-end rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Enregistrement…" : "Affecter"}</button>
              {notice && <p role="status" className="md:col-span-4 text-sm">{notice}</p>}
              <p className="text-xs text-slate-500 md:col-span-4">Uniquement les comptes déjà membres de l'organisation. Les rôles DG/RAF et les droits de signature sont configurés séparément.</p>
            </form>
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
