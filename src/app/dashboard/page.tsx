"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [userName, setUserName] = useState("User");
  const [organizationName, setOrganizationName] = useState("Workspace");
  const [loading, setLoading] = useState(true);
  type Workspace = {
  id: string;
  name: string;
  type: "hotel" | "head_office" | "head_office_department";
  country_code: string | null;
  parent_workspace_id?: string | null;
};

const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
const activeWorkspace = workspaces.find(
  (workspace) => workspace.id === activeWorkspaceId
);

  useEffect(() => {
    async function loadDashboard() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      if (profile?.full_name) {
        setUserName(profile.full_name);
      }

      const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!membership) {
        router.push("/onboarding");
        return;
      }

      const { data: organization } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", membership.organization_id)
        .single();

      if (organization?.name) {
        setOrganizationName(organization.name);
      }
      const { data: allowedWorkspaces, error: workspacesError } =
  await supabase
    .from("workspaces")
    .select("id, name, type, country_code, parent_workspace_id")
    .eq("organization_id", membership.organization_id)
    .order("name");

if (workspacesError) {
  console.error("Unable to load workspaces:", workspacesError);
} else if (allowedWorkspaces && allowedWorkspaces.length > 0) {
  setWorkspaces(allowedWorkspaces);

  const savedWorkspaceId = localStorage.getItem(
    "onosign_active_workspace"
  );

  const savedWorkspaceStillAllowed = allowedWorkspaces.some(
    (workspace) => workspace.id === savedWorkspaceId
  );

  const workspaceId = savedWorkspaceStillAllowed
    ? savedWorkspaceId!
    : allowedWorkspaces[0].id;

  setActiveWorkspaceId(workspaceId);
  localStorage.setItem("onosign_active_workspace", workspaceId);
}

      setLoading(false);
    }

    loadDashboard();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading Onosign...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">

      <div className="flex min-h-screen">

        {/* Sidebar */}
        <aside className="hidden w-64 flex-col bg-slate-950 p-6 text-white lg:flex">

          <div className="text-2xl font-bold">
            Ono<span className="text-emerald-400">sign</span>
          </div>

          <nav className="mt-12 space-y-2">
            <button className="w-full rounded-xl bg-slate-800 px-4 py-3 text-left">
              Dashboard
            </button>

            <button className="w-full rounded-xl px-4 py-3 text-left text-slate-400 hover:bg-slate-900">
              Documents
            </button>

            <button className="w-full rounded-xl px-4 py-3 text-left text-slate-400 hover:bg-slate-900">
              Signatures
            </button>

           <button
  type="button"
  onClick={() => router.push("/templates")}
  className="w-full rounded-xl px-4 py-3 text-left text-slate-400 hover:bg-slate-900"
>
  Templates
</button>

            <button className="w-full rounded-xl px-4 py-3 text-left text-slate-400 hover:bg-slate-900">
              Contacts
            </button>

            <button className="w-full rounded-xl px-4 py-3 text-left text-slate-400 hover:bg-slate-900">
              Team
            </button>

            <button className="w-full rounded-xl px-4 py-3 text-left text-slate-400 hover:bg-slate-900">
              Audit trail
            </button>

            <button className="w-full rounded-xl px-4 py-3 text-left text-slate-400 hover:bg-slate-900">
              Settings
            </button>
          </nav>

          <div className="mt-auto border-t border-slate-800 pt-5">
            <p className="truncate text-sm font-medium">
              {organizationName}
            </p>

            <button
              onClick={signOut}
              className="mt-3 text-sm text-slate-400 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </aside>

        {/* Main */}
        <section className="flex-1">

          <header className="border-b border-slate-200 bg-white px-8 py-5">
            <div className="mx-auto flex max-w-7xl items-center justify-between">

              <div>
  <p className="text-sm text-slate-500">
    {organizationName}
  </p>

  <div className="mt-1 flex items-center gap-4">
    <h1 className="text-xl font-semibold">
      Dashboard
    </h1>
    {activeWorkspace && (
  <p className="mt-1 text-sm font-medium text-emerald-600">
    {activeWorkspace.type === "hotel"
      ? "🏨"
      : activeWorkspace.type === "head_office"
      ? "🏢"
      : "↳"}{" "}
    {activeWorkspace.name}
  </p>
)}

    {workspaces.length > 0 && (
      <select
  value={activeWorkspaceId}
  onChange={(e) => {
    const workspaceId = e.target.value;

    setActiveWorkspaceId(workspaceId);
    localStorage.setItem("onosign_active_workspace", workspaceId);
  }}
  className="rounded-xl border border-slate-300 bg-white px-4 py-2"
>
  {workspaces.map((workspace) => (
    <option key={workspace.id} value={workspace.id}>
      {workspace.type === "hotel"
        ? `🏨 ${workspace.name}`
        : workspace.type === "head_office"
        ? `🏢 ${workspace.name}`
        : `↳ ${workspace.name}`}
    </option>
  ))}
</select>

    )}
  </div>
</div>

              <div className="text-right">
                <p className="text-sm font-medium">
                  {userName}
                </p>

                <p className="text-xs text-slate-500">
                  Compte OnoSign
                </p>
              </div>

            </div>
          </header>

          <div className="mx-auto max-w-7xl p-8">

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold">
                  Welcome, {userName}
                </h2>

                <p className="mt-2 text-slate-500">
                  Manage your documents and electronic signatures.
                </p>
              </div>

              <button
  type="button"
  onClick={() => router.push("/documents/new")}
  className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700"
>
  + New document
</button>
            </div>

            {/* Stats */}
            <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">

              <StatCard title="Documents" value="0" />
              <StatCard title="Waiting for signature" value="0" />
              <StatCard title="Completed" value="0" />
              <StatCard title="Team members" value="1" />

            </div>

            {/* Recent documents */}
            <div className="mt-8 rounded-2xl border border-slate-200 bg-white">

              <div className="border-b border-slate-200 p-6">
                <h3 className="text-lg font-semibold">
                  Recent documents
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Track your latest signature requests.
                </p>
              </div>

              <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">

                <div className="mb-4 text-4xl">
                  📄
                </div>

                <h4 className="font-semibold">
                  No documents yet
                </h4>

                <p className="mt-2 max-w-md text-sm text-slate-500">
                  Upload your first document and send it for electronic
                  signature.
                </p>

                <button className="mt-5 rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold hover:bg-slate-50">
                  Upload document
                </button>

              </div>
            </div>

          </div>
        </section>

      </div>
    </main>
  );
}

function StatCard({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  );
}