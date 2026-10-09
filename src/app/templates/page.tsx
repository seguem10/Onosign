"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

  
type WorkflowTemplate = {
  id: string;
  name: string;
  document_type: string;
  description: string | null;
  workspace_id: string;
  is_active: boolean;
  workspaces: { name: string } | null;
  workflow_steps: {
  id: string;
  step_order: number;
  role_label: string;
  recipient_type: string;
  is_requester: boolean;
  is_required: boolean;
}[];
};

export default function TemplatesPage() {
  const router = useRouter();

  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadTemplates() {
      const supabase = createClient();

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace("/");
        return;
      }

      const { data, error } = await supabase
        .from("workflow_templates")
  .select(`
  id,
  name,
  document_type,
  description,
  workspace_id,
  is_active,
  workspaces(name),
  workflow_steps(
    id,
    step_order,
    role_label,
    recipient_type,
    is_requester,
    is_required
  )
`)
        .eq("is_active", true)
        .order("name");

   if (error) {
  setErrorMessage(error.message);
} else {
  console.log("ONOSIGN TEMPLATES:", data);
  setTemplates(
  (data ?? []).map((template) => ({
    ...template,
    workspaces: Array.isArray(template.workspaces)
      ? template.workspaces[0] ?? null
      : template.workspaces ?? null,
  }))
);
}

setLoading(false);
}

loadTemplates();
}, [router]);
  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="mb-6 text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to Dashboard
        </button>

        <h1 className="text-3xl font-bold">Templates</h1>

        <p className="mt-2 text-slate-500">
          DI and DR signature workflow templates.
        </p>

        {loading ? (
          <p className="mt-8">Loading templates...</p>
        ) : errorMessage ? (
          <p className="mt-8 text-red-600">{errorMessage}</p>
        ) : templates.length === 0 ? (
          <div className="mt-8 rounded-xl border bg-white p-8">
            <p>No active templates available.</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {templates.map((template) => (
              <div
                key={template.id}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {template.document_type}
                </span>

                <h2 className="mt-4 text-xl font-semibold">
                  {template.name}
                </h2>

                <p className="mt-2 text-sm text-slate-500">
                  {template.description || "Standard signature workflow"}
                </p>

                <p className="mt-4 text-xs text-slate-400">
                  Hotel / Service: {template.workspaces?.name ?? "Non disponible"}
                </p>
                <div className="mt-5 border-t border-slate-100 pt-4">
  <p className="mb-3 text-sm font-semibold text-slate-700">
    Circuit de signature
  </p>

  <div className="flex flex-wrap items-center gap-2">
    {[...(template.workflow_steps ?? [])]
      .sort((a, b) => a.step_order - b.step_order)
      .map((step, index) => (
        <div key={step.id} className="flex items-center gap-2">
          {index > 0 && (
            <span className="text-slate-400">→</span>
          )}

          <span className="rounded-full bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            {step.step_order}. {step.role_label}
          </span>
        </div>
      ))}
  </div>
</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}