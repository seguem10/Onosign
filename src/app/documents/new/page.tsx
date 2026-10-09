"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase";

type DocumentType = "DI" | "DR";

type Workspace = {
  id: string;
  name: string;
  type: "hotel" | "head_office" | "head_office_department";
};

type WorkflowTemplate = {
  id: string;
  name: string;
  document_type: string;
};

export default function NewDocumentPage() {
  const router = useRouter();

  const [documentType, setDocumentType] =
    useState<DocumentType>("DI");

  const [workflowTemplates, setWorkflowTemplates] =
    useState<WorkflowTemplate[]>([]);

  const [selectedTemplateId, setSelectedTemplateId] =
    useState("");
   const availableTemplates = workflowTemplates.filter(
  (template) => template.document_type === documentType
);

  const [title, setTitle] = useState("");
  const [amountEur, setAmountEur] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [userId, setUserId] = useState("");
  const [userFullName, setUserFullName] =
  useState("");

const [userEmail, setUserEmail] =
  useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const supabase = createClient();

    async function initializePage() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.push("/");
          return;
        }

        setUserId(user.id);
        const { data: profile, error: profileError } =
  await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

if (profileError) {
  console.error(
    "Unable to load user profile:",
    profileError
  );
}
setUserFullName(
  profile?.full_name ||
    user.user_metadata?.full_name ||
    user.email ||
    "Collaborateur"
);

setUserEmail(user.email || "");

        const { data: membership, error: membershipError } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (membershipError || !membership) {
          setErrorMessage("Unable to find your organization.");
          setLoading(false);
          return;
        }

        setOrganizationId(membership.organization_id);

        const activeWorkspaceId = localStorage.getItem(
          "onosign_active_workspace"
        );

        if (!activeWorkspaceId) {
          setErrorMessage(
            "No active workspace selected. Return to the dashboard and select a workspace."
          );
          setLoading(false);
          return;
        }

        const { data: workspaceData, error: workspaceError } = await supabase
          .from("workspaces")
          .select("id, name, type")
          .eq("id", activeWorkspaceId)
          .eq("organization_id", membership.organization_id)
          .maybeSingle();

        if (workspaceError || !workspaceData) {
          setErrorMessage("You do not have access to this workspace.");
          setLoading(false);
          return;
        }
const { data: templatesData, error: templatesError } =
  await supabase
    .from("workflow_templates")
    .select("id, name, document_type")
    .eq("workspace_id", workspaceData.id)
    .eq("is_active", true)
    .order("name");

if (templatesError) {
  throw new Error(
    `Unable to load workflow templates: ${templatesError.message}`
  );
}

setWorkflowTemplates(templatesData ?? []);
        setWorkspace(workspaceData as Workspace);
        setLoading(false);
      } catch (error) {
        console.error(error);
        setErrorMessage("Unable to initialize the page.");
        setLoading(false);
      }
    }

    initializePage();
  }, [router]);

  async function handleContinue() {
    if (!workspace) {
      setErrorMessage("No active workspace selected.");
      return;
    }

    if (!organizationId || !userId) {
      setErrorMessage("Unable to identify your account.");
      return;
    }

    if (!title.trim()) {
      setErrorMessage("Please enter a document title.");
      return;
    }

    if (documentType === "DI" && (amountEur.trim() === "" || !Number.isFinite(Number(amountEur.replace(",", "."))) || Number(amountEur.replace(",", ".")) < 0 || !/^\\d+(?:[.,]\\d{1,2})?$/.test(amountEur.trim()))) {
      setErrorMessage("Saisissez un montant DI valide en euros (2 décimales maximum).");
      return;
    }

    if (!file) {
      setErrorMessage("Please select a PDF file.");
      return;
    }

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      setErrorMessage("Only PDF files are allowed.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    const supabase = createClient();
    let uploadedPath = "";

    try {
      const safeFileName = file.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_");

      const uniqueFileName = `${Date.now()}-${crypto.randomUUID()}-${safeFileName}`;

      uploadedPath = `${workspace.id}/${userId}/${uniqueFileName}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(uploadedPath, file, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // A legacy template selected in the UI must never be treated as applied.
      // The document remains a draft until an atomic workflow assignment exists.
      const { data: createdDocument, error: documentError } = await supabase
        .from("documents")
        .insert({
          organization_id: organizationId,
          workspace_id: workspace.id,
          created_by: userId,
          title: title.trim(),
          storage_path: uploadedPath,
          status: "draft",
          document_type: documentType,
          amount_eur: documentType === "DI" ? Number(amountEur.replace(",", ".")) : null,
        })
        .select("id")
        .single();

      if (documentError) {
        await supabase.storage
          .from("documents")
          .remove([uploadedPath]);

        throw new Error(
          `Document creation failed: ${documentError.message}`
        );
      }

      if (!createdDocument) {
        throw new Error("Document was not created.");
      }
      const { error: creatorRecipientError } =
  await supabase
    .from("recipients")
    .insert({
      document_id: createdDocument.id,
      name: userFullName,
      email: userEmail,
      role_label: "Demandeur",
      signing_order: 1,
      status: "pending",
      recipient_type: "signer",
    });

if (creatorRecipientError) {
  throw new Error(
    `Unable to add the requester as first signer: ${creatorRecipientError.message}`
  );
}



      router.push(`/documents/${createdDocument.id}/prepare`);
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred."
      );

      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading OnoSign...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="mb-8 text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          ← Back to dashboard
        </button>

        <p className="text-sm font-semibold uppercase tracking-widest text-emerald-600">
          OnoSign
        </p>

        <h1 className="mt-3 text-3xl font-bold">
          New document
        </h1>

        <p className="mt-2 text-slate-500">
          Prepare a DI or DR for electronic signature.
        </p>

        {workspace && (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Active workspace
            </p>

            <p className="mt-1 font-semibold">
              {workspace.type === "hotel"
                ? "🏨 "
                : workspace.type === "head_office"
                  ? "🏢 "
                  : "↳ "}
              {workspace.name}
            </p>
          </div>
        )}

        {errorMessage && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold text-emerald-600">
            STEP 1
          </p>

          <h2 className="mt-1 text-xl font-bold">
            Select document type
          </h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setDocumentType("DI");
                setSelectedTemplateId("");
              }}
              className={`rounded-xl border p-5 text-left ${
                documentType === "DI"
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold">DI</p>
                  <p className="text-sm text-slate-500">
                    Demande d&apos;Investissement
                  </p>
                </div>
                {documentType === "DI" && (
                  <span className="rounded-full bg-emerald-600 px-2 py-1 text-white">
                    ✓
                  </span>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setDocumentType("DR");
                setSelectedTemplateId("");
              }}
              className={`rounded-xl border p-5 text-left ${
                documentType === "DR"
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold">DR</p>
                  <p className="text-sm text-slate-500">
                    Demande de Règlement
                  </p>
                </div>
                {documentType === "DR" && (
                  <span className="rounded-full bg-emerald-600 px-2 py-1 text-white">
                    ✓
                  </span>
                )}
              </div>
            </button>
          </div>

          <div className="mt-6">
            <label
              htmlFor="workflow-template"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Modèle de signature
            </label>
            <select
              id="workflow-template"
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
            >
              <option value="">Aucun modèle appliqué (configuration manuelle)</option>
              {availableTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            {selectedTemplateId && (
              <p className="mt-2 text-sm text-amber-700">
                Le modèle sélectionné est uniquement indicatif : il ne sera ni enregistré
                ni appliqué. Configurez et vérifiez tous les signataires manuellement.
              </p>
            )}
            {availableTemplates.length === 0 && (
              <p className="mt-2 text-sm text-amber-600">
                Aucun modèle historique actif disponible pour ce type de document.
              </p>
            )}
          </div>

          <div className="my-8 border-t border-slate-200" />

          {/* STEP 2 */}
          <section>
            <p className="text-sm font-semibold text-emerald-600">
              STEP 2
            </p>

            <h2 className="mt-1 text-xl font-bold">
              Document information
            </h2>

            <div className="mt-5">
              <label className="mb-2 block text-sm font-medium">
                Document title
              </label>

              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={
                  documentType === "DI"
                    ? "Example: DI - IT equipment"
                    : "Example: DR - Supplier payment"
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
              />
            </div>
          </section>

          {documentType === "DI" && (
            <div className="mt-5">
              <label htmlFor="amount-eur" className="mb-2 block text-sm font-semibold">
                Montant de la DI (€)
              </label>
              <input id="amount-eur" inputMode="decimal" type="text"
                value={amountEur} onChange={(event) => setAmountEur(event.target.value)}
                placeholder="Exemple : 19999,99"
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              />
              <p className="mt-2 text-xs text-amber-700">
                Le montant est enregistré, mais le contrôle obligatoire des fondés de pouvoir
                n'est pas encore activé à l'envoi.
              </p>
            </div>
          )}

          <div className="my-8 border-t border-slate-200" />

          {/* STEP 3 */}
          <section>
            <p className="text-sm font-semibold text-emerald-600">
              STEP 3
            </p>

            <h2 className="mt-1 text-xl font-bold">
              Upload supporting document
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Upload the quotation or invoice associated with this request.
            </p>

            <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-10 text-center hover:border-emerald-500">
              <div className="text-3xl">📄</div>

              <p className="mt-3 font-semibold">
                {file ? file.name : "Choose a PDF"}
              </p>

              <p className="mt-1 text-sm text-slate-500">
                PDF only
              </p>

              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(event) => {
                  const selectedFile =
                    event.target.files?.[0] ?? null;

                  setFile(selectedFile);
                  setErrorMessage("");
                }}
              />
            </label>

            {file && (
              <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">
                    {file.name}
                  </p>

                  <p className="text-xs text-slate-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="text-sm font-medium text-red-600"
                >
                  Remove
                </button>
              </div>
            )}
          </section>

          {/* SUMMARY */}
          <div className="mt-8 rounded-xl bg-slate-50 p-5">
            <p className="font-semibold">
              Document summary
            </p>

            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">
                  Workspace
                </span>

                <span className="font-medium">
                  {workspace?.name ?? "-"}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">
                  Type
                </span>

                <span className="font-medium">
                  {documentType}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">
                  Title
                </span>

                <span className="font-medium">
                  {title || "Not defined"}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">
                  File
                </span>

                <span className="font-medium">
                  {file ? file.name : "No file selected"}
                </span>
              </div>
            </div>
          </div>

          {/* ACTIONS */}
          <div className="mt-8 flex items-center justify-between">
            <button
              type="button"
              disabled={submitting}
              onClick={() => router.push("/dashboard")}
              className="rounded-xl border border-slate-300 px-5 py-3 font-semibold"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleContinue}
              disabled={
                submitting ||
                !workspace ||
                !title.trim() ||
                !file || (documentType === "DI" && (amountEur.trim() === "" || !/^\\d+(?:[.,]\\d{1,2})?$/.test(amountEur.trim())))
              }
              className="rounded-xl bg-emerald-600 px-7 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? "Creating..." : "Continue →"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
         