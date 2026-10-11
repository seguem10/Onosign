"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Document, Page, pdfjs } from "react-pdf";
import { createClient } from "@/lib/supabase";

/*
 * PDF.js worker
 *
 * On utilise exactement la version PDF.js utilisée par react-pdf.
 * Cela évite les erreurs "API version does not match Worker version".
 */
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type DocumentData = {
  id: string;
  title: string;
  status: string;
  storage_path: string;
  workspace_id: string;
  created_at: string;
  signature_blueprint_id: string | null;
};

type Recipient = {
  id?: string;
  name: string;
  email: string;
  role_label: string;
  signing_order: number;
  status: string;
  recipient_type:
  | "signer"
  | "cc"
  | "viewer"
  | "specify_recipients"
  | "update_recipients"
  | "editor";
};

type FieldType =
  | "signature"
  | "initials"
  | "name"
  | "email"
  | "date_signed"
  | "text";

type SignatureField = {
  id: string;
  document_id: string;
  recipient_id: string;
  field_type: FieldType;
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
};

const FIELD_CONFIG: Record<
  FieldType,
  {
    label: string;
    icon: string;
    width: number;
    height: number;
  }
> = {
  signature: {
    label: "Signature",
    icon: "✍",
    width: 0.28,
    height: 0.07,
  },
  initials: {
    label: "Initials",
    icon: "✎",
    width: 0.16,
    height: 0.06,
  },
  name: {
    label: "Name",
    icon: "👤",
    width: 0.25,
    height: 0.05,
  },
  email: {
    label: "Email",
    icon: "✉",
    width: 0.3,
    height: 0.05,
  },
  date_signed: {
    label: "Date signed",
    icon: "📅",
    width: 0.22,
    height: 0.05,
  },
  text: {
    label: "Text",
    icon: "T",
    width: 0.28,
    height: 0.06,
  },
};

export default function PrepareDocumentPage() {

  const params = useParams();
  const router = useRouter();


  const documentId = params.id as string;

  const [document, setDocument] =
    useState<DocumentData | null>(null);

  type AuditEvent = { id: number; event_type: string; previous_status: string | null; next_status: string | null; occurred_at: string };
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditError, setAuditError] = useState("");
  const [auditChainBusy, setAuditChainBusy] = useState(false);
  const [auditChainMessage, setAuditChainMessage] = useState("");
  async function verifyAuditChain() {
    if (auditChainBusy) return;
    setAuditChainBusy(true);
    setAuditChainMessage("");
    try {
      const response = await fetch(
        `/api/documents/${encodeURIComponent(documentId)}/audit/verify`,
        { cache: "no-store" }
      );
      const data: {
        chain_valid?: boolean; event_count?: number; message?: string;
      } = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Vérification indisponible.");
      if (!data.event_count) {
        setAuditChainMessage("Aucun événement enregistré : vérification impossible.");
      } else if (data.chain_valid) {
        setAuditChainMessage(
          `Chaîne SHA-256 cohérente pour ${data.event_count} événement(s). Ne constitue pas une preuve juridique.`
        );
      } else {
        setAuditChainMessage("⚠️ Chaîne technique incohérente : contactez l'administrateur.");
      }
    } catch (error) {
      setAuditChainMessage(error instanceof Error ? error.message : "Vérification impossible.");
    } finally {
      setAuditChainBusy(false);
    }
  }

  useEffect(() => {
    if (!documentId) return;
    let active = true;
    const supabase = createClient();
    void supabase.from("onosign_document_audit")
      .select("id,event_type,previous_status,next_status,occurred_at")
      .eq("document_id", documentId)
      .order("occurred_at", { ascending: false })
      .limit(30)
      .then(({data,error}) => {
        if (!active) return;
        if (error) setAuditError("Historique indisponible.");
        else setAuditEvents((data ?? []) as AuditEvent[]);
      });
    return () => { active = false; };
  }, [documentId]);
  const [workspaceName, setWorkspaceName] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [integrityChecking, setIntegrityChecking] = useState(false);
  const [integrityResult, setIntegrityResult] = useState("");
  async function verifyOriginalPdf() {
    if (integrityChecking) return;
    setIntegrityChecking(true);
    setIntegrityResult("");
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/integrity`, {
        method: "GET",
        cache: "no-store",
      });
      const data: { verified?: boolean; message?: string } = await response.json();
      setIntegrityResult(data.message ?? "Résultat de vérification indisponible.");
    } catch {
      setIntegrityResult("Impossible de contacter le service de vérification.");
    } finally {
      setIntegrityChecking(false);
    }
  }


  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [populatingBlueprint, setPopulatingBlueprint] = useState(false);
  const [blueprintMessage, setBlueprintMessage] = useState("");

  const [savingRecipients, setSavingRecipients] =
    useState(false);

  const [recipientMessage, setRecipientMessage] =
    useState("");

  const [showAddSigner, setShowAddSigner] =
    useState(false);

const [newSigner, setNewSigner] = useState({
  name: "",
  email: "",
  role_label: "",
  recipient_type: "signer" as Recipient["recipient_type"],
});

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  /*
   * PDF editor states
   */
  const [numPages, setNumPages] = useState(0);

  const [selectedRecipientId, setSelectedRecipientId] =
    useState("");

  const [selectedFieldType, setSelectedFieldType] =
    useState<FieldType | null>(null);

  const [signatureFields, setSignatureFields] =
    useState<SignatureField[]>([]);

  const [fieldMessage, setFieldMessage] = useState("");

  const [savingField, setSavingField] = useState(false);
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(
  null
);
const [resizingFieldId, setResizingFieldId] = useState<string | null>(
  null
);

const dragOffset = useRef({
  x: 0,
  y: 0,
});

  /*
   * -------------------------------------------------------
   * LOAD DOCUMENT
   * -------------------------------------------------------
   */
  useEffect(() => {
    const supabase = createClient();

    async function loadDocument() {
      if (!document) {
  setLoading(true);
}
      setErrorMessage("");

      const { data, error } = await supabase
        .from("documents")
        .select(
          "id, title, status, storage_path, workspace_id, created_at, signature_blueprint_id"
        )
        .eq("id", documentId)
        .maybeSingle();

      if (error || !data) {
  console.error("Document load error:", error);

  setLoading(false);

  if (!document) {
    setErrorMessage(
      error?.message ||
        "Document not found or access denied."
    );
  }

  return;
}

      setDocument(data);
      /*
       * Workspace
       */
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("name")
        .eq("id", data.workspace_id)
        .maybeSingle();

      if (workspace) {
        setWorkspaceName(workspace.name);
      }

      /*
       * Secure PDF URL
       */
      const {
        data: signedData,
        error: signedError,
      } = await supabase.storage
        .from("documents")
        .createSignedUrl(data.storage_path, 3600);

      if (signedError || !signedData?.signedUrl) {
        setErrorMessage(
          signedError?.message ||
            "Unable to load PDF preview."
        );

        setLoading(false);
        return;
      }

      setPdfUrl(signedData.signedUrl);
      /*
       * Recipients
       */
      const {
        data: recipientData,
        error: recipientError,
      } = await supabase
        .from("recipients")
        .select(
          "id, name, email, role_label, signing_order, status, recipient_type"
        )
        .eq("document_id", documentId)
        .order("signing_order", {
          ascending: true,
        });

      if (recipientError) {
        setErrorMessage("Impossible de charger les destinataires du document.");
        setLoading(false);
        return;
      } else {
        const loadedRecipients = recipientData || [];

        setRecipients(loadedRecipients);
        if (loadedRecipients.length > 0) {
          setSelectedRecipientId(
            loadedRecipients[0].id
          );
        }
      }

      /*
       * Signature fields
       */
      const {
        data: fieldsData,
        error: fieldsError,
      } = await supabase
        .from("signature_fields")
        .select(
          "id, document_id, recipient_id, field_type, page_number, x, y, width, height, required"
        )
        .eq("document_id", documentId)
        .order("created_at", {
          ascending: true,
        });
        if (fieldsError) {
        setErrorMessage("Impossible de charger les champs de signature du PDF.");
        setLoading(false);
        return;
      } else {
        setSignatureFields(
          (fieldsData || []) as SignatureField[]
        );
      }

      setLoading(false);

}

    if (documentId) {
      loadDocument();
    }
  }, [documentId]);

  const [availableBlueprints, setAvailableBlueprints] = useState<Array<{blueprint_id:string;blueprint_name:string}>>([]);
  const [selectedBlueprint, setSelectedBlueprint] = useState("");
  const [assigningBlueprint, setAssigningBlueprint] = useState(false);

  useEffect(() => {
    if (!document || document.status !== "draft" || document.signature_blueprint_id) return;
    let cancelled = false;
    const supabase = createClient();
    void supabase.rpc("onosign_available_document_blueprints", {p_document_id: documentId})
      .then(({data,error}) => {
        if (!cancelled && !error && data) setAvailableBlueprints(data);
      });
    return () => { cancelled = true; };
  }, [document, documentId]);

  async function assignSelectedBlueprint() {
    if (!selectedBlueprint || assigningBlueprint || !document || document.status !== "draft") return;
    setAssigningBlueprint(true);
    setBlueprintMessage("");
    try {
      const supabase = createClient();
      const {error} = await supabase.rpc("onosign_assign_blueprint", {
        p_document_id: documentId, p_blueprint_id: selectedBlueprint,
      });
      if (error) throw new Error(error.message);
      setDocument({...document, signature_blueprint_id: selectedBlueprint});
      setBlueprintMessage("Modèle associé. Vous pouvez maintenant appliquer ses signataires.");
    } catch (error) {
      setBlueprintMessage(error instanceof Error ? error.message : "Association impossible");
    } finally {
      setAssigningBlueprint(false);
    }
  }

  type BlueprintPreflight = {
    ready_for_review: boolean;
    dispatch_authorized: boolean;
    issues: string[];
    recipients: number;
    mapped_recipients: number;
    required_power_signers: number;
    actual_power_signers: number;
    signers_missing_signature_fields: number;
    pdf_integrity_verified: boolean;
  };
  const [preflight, setPreflight] = useState<BlueprintPreflight | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError, setPreflightError] = useState("");
  useEffect(() => {
    let current = true;
    // Invalidate a previous server result after changes, without a synchronous effect update.
    queueMicrotask(() => { if (current) setPreflight(null); });
    return () => { current = false; };
  }, [recipients, signatureFields, document?.signature_blueprint_id]);
  const issueLabels: Record<string, string> = {
    not_draft: "Le document n'est plus en brouillon.",
    blueprint_inactive: "Le modèle est inactif.",
    recipient_mapping_incomplete: "Les destinataires ne correspondent pas au modèle.",
    recipient_already_processed: "Un destinataire a déjà été traité.",
    duplicate_recipient_email: "Une adresse e-mail apparaît plusieurs fois.",
    missing_signature_fields: "Certains signataires n'ont pas de champ de signature.",
    insufficient_power_of_attorney: "Nombre de fondés de pouvoir insuffisant.",
    payment_request_second_director_required: "Une signature de directeur est obligatoire pour chaque DR ; deux au-delà de 20 000 €.",
    missing_or_invalid_amount: "Le montant du document doit être renseigné et positif ou nul.",
    recipient_step_mismatch: "Un destinataire ne correspond plus à son étape du modèle.",
    missing_required_workflow_step: "Une étape obligatoire du circuit est absente.",
    invalid_requester_order: "Le demandeur doit être le seul signataire en première position.",
    unexpected_workflow_step: "Un signataire conditionnel est présent alors que le montant ne le prévoit pas.",
    requester_mapping_invalid: "Le demandeur initial n’est pas correctement identifié.",
    duplicate_signing_order: "Plusieurs destinataires occupent la même position de signature.",
    invalid_signature_field: "Un champ PDF est invalide ou associé à un mauvais destinataire.",
    original_pdf_missing_hash: "Le PDF original ne possède pas d'empreinte SHA-256 valide.",
    original_pdf_invalid_path: "Le PDF original n'est pas dans le dossier du créateur.",
    original_pdf_unavailable: "Le fichier PDF original est inaccessible ou trop volumineux.",
    original_pdf_invalid_format: "Le contenu stocké ne correspond pas à un PDF.",
    original_pdf_mismatch: "L'empreinte du PDF a changé : document potentiellement altéré.",
  };
  async function checkBlueprintPreflight() {
    if (!document?.signature_blueprint_id || preflightLoading) return;
    setPreflightLoading(true);
    setPreflightError("");
    setPreflight(null);
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/review`, {
        method: "GET",
        cache: "no-store",
      });
      const data = await response.json() as BlueprintPreflight & {message?: string};
      if (!response.ok) throw new Error(data.message ?? "Vérification serveur indisponible.");
      setPreflight(data);
    } catch (error) {
      setPreflightError(error instanceof Error ? error.message : "Contrôle indisponible");
    } finally {
      setPreflightLoading(false);
    }
  }

  async function populateAssignedBlueprint() {
    if (!document?.signature_blueprint_id || document.status !== "draft" ||
        recipients.length !== 1 || signatureFields.length > 0 || populatingBlueprint) return;
    setPopulatingBlueprint(true);
    setBlueprintMessage("");
    try {
      const supabase = createClient();
      const { data: added, error } = await supabase.rpc("onosign_populate_blueprint_recipients", {
        p_document_id: documentId,
      });
      if (error) throw new Error(error.message);
      const { data: updated, error: readError } = await supabase
        .from("recipients")
        .select("id, name, email, role_label, signing_order, status, recipient_type")
        .eq("document_id", documentId)
        .order("signing_order", { ascending: true });
      if (readError || !updated) throw new Error(readError?.message ?? "Destinataires indisponibles");
      setRecipients(updated as Recipient[]);
      setBlueprintMessage(`${added} destinataire(s) ajouté(s) au brouillon. Vérifiez les identités et les champs de signature.`);
    } catch (error) {
      setBlueprintMessage(error instanceof Error ? error.message : "Impossible d'appliquer le modèle.");
    } finally {
      setPopulatingBlueprint(false);
    }
  }

  /*
   * -------------------------------------------------------
   * ADD SIGNER
   * -------------------------------------------------------
   */
  async function addSigner() {
    setRecipientMessage("");
    if (!document || document.status !== "draft" || document.signature_blueprint_id) {
      setRecipientMessage("Les signataires des modèles DI/DR sont gérés par le circuit central. Modification manuelle indisponible.");
      return;
    }

    const name = newSigner.name.trim();

    const email = newSigner.email
      .trim()
      .toLowerCase();

    const role = newSigner.role_label;

    if (!name || !email || !role) {
      setRecipientMessage("Renseignez le nom, l'adresse e-mail et le rôle.");
      return;
    }
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      setRecipientMessage("L'adresse e-mail du destinataire est invalide.");
      return;
    }
    if (recipients.some((recipient) => recipient.email.trim().toLowerCase() === email)) {
      setRecipientMessage("Cette adresse e-mail est déjà utilisée par un destinataire du document.");
      return;
    }

    setSavingRecipients(true);

    const supabase = createClient();

    const nextOrder =
      recipients.length > 0
        ? Math.max(
            ...recipients.map(
              (recipient) =>
                recipient.signing_order
            )
          ) + 1
        : 1;

    const { data, error } = await supabase
      .from("recipients")
      .insert({
        document_id: documentId,
        name,
        email,
        role_label: role,
        recipient_type: newSigner.recipient_type,
        signing_order: nextOrder,
        status: "pending",
      })
      .select(
  "id, name, email, role_label, signing_order, status, recipient_type"
)
      .single();

    if (error) {
      setRecipientMessage(error.message);
      setSavingRecipients(false);
      return;
    }

    setRecipients((current) => [
      ...current,
      data,
    ]);

    /*
     * If this is the first recipient,
     * select it automatically.
     */
    if (!selectedRecipientId) {
      setSelectedRecipientId(data.id);
    }

    setNewSigner({
  name: "",
  email: "",
  role_label: "",
  recipient_type: "signer",
});
    setShowAddSigner(false);
    setSavingRecipients(false);
  }

  /*
   * -------------------------------------------------------
   * ADD FIELD TO PDF
   * -------------------------------------------------------
   */
  async function dropFieldOnPage(
  event: React.DragEvent<HTMLDivElement>,
  pageNumber: number
) {
  event.preventDefault();
  event.stopPropagation();
  if (document?.status !== "draft") {
    setFieldMessage("Les champs ne peuvent être modifiés que dans un brouillon.");
    return;
  }

  if (!selectedRecipientId) {
    setFieldMessage(
      "Select a recipient before adding a field."
    );
    return;
  }
const selectedRecipient =
  getRecipient(selectedRecipientId);

if (
  !selectedRecipient ||
  selectedRecipient.recipient_type !== "signer"
) {
  setFieldMessage(
    "Fields can only be assigned to a recipient who must sign."
  );

  return;
}
  if (savingField) {
    return;
  }

  const fieldType = event.dataTransfer.getData(
    "application/onosign-field"
  ) as FieldType;

  if (!fieldType || !FIELD_CONFIG[fieldType]) {
    return;
  }

  const pageElement = event.currentTarget;
  const rect = pageElement.getBoundingClientRect();

  const dropX =
    (event.clientX - rect.left) / rect.width;

  const dropY =
    (event.clientY - rect.top) / rect.height;

  const config = FIELD_CONFIG[fieldType];

  let x = dropX - config.width / 2;
  let y = dropY - config.height / 2;

  x = Math.max(
    0,
    Math.min(x, 1 - config.width)
  );

  y = Math.max(
    0,
    Math.min(y, 1 - config.height)
  );

  setSavingField(true);
  setFieldMessage("");

  const supabase = createClient();

  const { data, error } = await supabase
    .from("signature_fields")
    .insert({
      document_id: documentId,
      recipient_id: selectedRecipientId,
      field_type: fieldType,
      page_number: pageNumber,
      x,
      y,
      width: config.width,
      height: config.height,
      required: true,
    })
    .select(
      "id, document_id, recipient_id, field_type, page_number, x, y, width, height, required"
    )
    .single();

  if (error) {
    setFieldMessage(error.message);
    setSavingField(false);
    return;
  }

  setSignatureFields((current) => [
    ...current,
    data as SignatureField,
  ]);

  setSavingField(false);

  setFieldMessage(
    `${config.label} field added successfully.`
  );
}
  async function addFieldToPage(
    event: React.MouseEvent<HTMLDivElement>,
    pageNumber: number
  ) {
    if (!selectedFieldType) {
      return;
    }

    if (!selectedRecipientId) {
      setFieldMessage(
        "Select a recipient before adding a field."
      );

      return;
    }
const selectedRecipient =
  getRecipient(selectedRecipientId);

if (
  !selectedRecipient ||
  selectedRecipient.recipient_type !== "signer"
) {
  setFieldMessage(
    "Fields can only be assigned to a recipient who must sign."
  );

  return;
}
    if (savingField) {
      return;
    }

    const pageElement =
      event.currentTarget;

    const rect =
      pageElement.getBoundingClientRect();

    /*
     * Position of click inside PDF page.
     */
    const clickX =
      (event.clientX - rect.left) /
      rect.width;

    const clickY =
      (event.clientY - rect.top) /
      rect.height;

    const config =
      FIELD_CONFIG[selectedFieldType];

    /*
     * We store normalized coordinates 0 -> 1.
     *
     * This is important because the coordinates remain
     * valid regardless of screen size.
     */
    let x = clickX - config.width / 2;
    let y = clickY - config.height / 2;

    /*
     * Prevent field from leaving PDF page.
     */
    x = Math.max(
      0,
      Math.min(x, 1 - config.width)
    );

    y = Math.max(
      0,
      Math.min(y, 1 - config.height)
    );

    setSavingField(true);
    setFieldMessage("");

    const supabase = createClient();

    const { data, error } = await supabase
      .from("signature_fields")
      .insert({
        document_id: documentId,
        recipient_id: selectedRecipientId,
        field_type: selectedFieldType,
        page_number: pageNumber,
        x,
        y,
        width: config.width,
        height: config.height,
        required: true,
      })
      .select(
        "id, document_id, recipient_id, field_type, page_number, x, y, width, height, required"
      )
      .single();

    if (error) {
      setFieldMessage(error.message);
      setSavingField(false);
      return;
    }

    setSignatureFields((current) => [
      ...current,
      data as SignatureField,
    ]);

    setSelectedFieldType(null);
    setSavingField(false);

    setFieldMessage(
      `${config.label} field added successfully.`
    );
  }

  /*
   * -------------------------------------------------------
   * DELETE FIELD
   * -------------------------------------------------------
   */
 
  
function moveField(
  event: React.MouseEvent<HTMLDivElement>,
  field: SignatureField
) {
  event.preventDefault();
  event.stopPropagation();

  const fieldElement = event.currentTarget;

  const pageElement = fieldElement.closest<HTMLElement>(
    '[data-pdf-page="true"]'
  );

  if (!pageElement) {
    setFieldMessage("PDF page not found.");
    return;
  }

  const rect = pageElement.getBoundingClientRect();

  const startPointerX =
    (event.clientX - rect.left) / rect.width;

  const startPointerY =
    (event.clientY - rect.top) / rect.height;

  const startFieldX = Number(field.x);
  const startFieldY = Number(field.y);

  let finalX = startFieldX;
  let finalY = startFieldY;

  setDraggingFieldId(field.id);
  setFieldMessage("");

  function handleMouseMove(moveEvent: MouseEvent) {
    const currentPointerX =
      (moveEvent.clientX - rect.left) / rect.width;

    const currentPointerY =
      (moveEvent.clientY - rect.top) / rect.height;

    finalX = Math.max(
      0,
      Math.min(
        startFieldX + currentPointerX - startPointerX,
        1 - Number(field.width)
      )
    );

    finalY = Math.max(
      0,
      Math.min(
        startFieldY + currentPointerY - startPointerY,
        1 - Number(field.height)
      )
    );

    setSignatureFields((current) =>
      current.map((item) =>
        item.id === field.id
          ? {
              ...item,
              x: finalX,
              y: finalY,
            }
          : item
      )
    );
  }

  async function handleMouseUp() {
    window.removeEventListener(
      "mousemove",
      handleMouseMove
    );

    window.removeEventListener(
      "mouseup",
      handleMouseUp
    );

    setDraggingFieldId(null);

    const supabase = createClient();

    const { error } = await supabase
      .from("signature_fields")
      .update({
        x: finalX,
        y: finalY,
      })
      .eq("id", field.id);

    if (error) {
      setFieldMessage(
        `Unable to save position: ${error.message}`
      );
      return;
    }

    setFieldMessage("Field position saved.");
  }

  window.addEventListener(
    "mousemove",
    handleMouseMove
  );

  window.addEventListener(
    "mouseup",
    handleMouseUp
  );
}
function resizeField(
  event: React.MouseEvent<HTMLDivElement>,
  field: SignatureField
) {
  event.preventDefault();
  event.stopPropagation();

  const fieldElement = event.currentTarget.parentElement;

  const pageElement = fieldElement?.closest<HTMLElement>(
    '[data-pdf-page="true"]'
  );

  if (!pageElement) {
    setFieldMessage("PDF page not found.");
    return;
  }

  const rect = pageElement.getBoundingClientRect();

  const startPointerX =
    (event.clientX - rect.left) / rect.width;

  const startPointerY =
    (event.clientY - rect.top) / rect.height;

  const startWidth = Number(field.width);
  const startHeight = Number(field.height);

  let finalWidth = startWidth;
  let finalHeight = startHeight;

  setResizingFieldId(field.id);
  setFieldMessage("");

  function handleMouseMove(moveEvent: MouseEvent) {
    const currentPointerX =
      (moveEvent.clientX - rect.left) / rect.width;

    const currentPointerY =
      (moveEvent.clientY - rect.top) / rect.height;

    finalWidth = Math.max(
      0.08,
      Math.min(
        startWidth + currentPointerX - startPointerX,
        1 - Number(field.x)
      )
    );

    finalHeight = Math.max(
      0.04,
      Math.min(
        startHeight + currentPointerY - startPointerY,
        1 - Number(field.y)
      )
    );

    setSignatureFields((current) =>
      current.map((item) =>
        item.id === field.id
          ? {
              ...item,
              width: finalWidth,
              height: finalHeight,
            }
          : item
      )
    );
  }

  async function handleMouseUp() {
    window.removeEventListener(
      "mousemove",
      handleMouseMove
    );

    window.removeEventListener(
      "mouseup",
      handleMouseUp
    );

    setResizingFieldId(null);

    const supabase = createClient();

    const { error } = await supabase
      .from("signature_fields")
      .update({
        width: finalWidth,
        height: finalHeight,
      })
      .eq("id", field.id);

    if (error) {
      setFieldMessage(
        `Unable to save field size: ${error.message}`
      );
      return;
    }

    setFieldMessage("Field size saved.");
  }

  window.addEventListener(
    "mousemove",
    handleMouseMove
  );

  window.addEventListener(
    "mouseup",
    handleMouseUp
  );
}
  async function deleteField(
    fieldId: string
  ) {
    if (document?.status !== "draft") {
      setFieldMessage("Suppression impossible : le document n’est plus en brouillon.");
      return;
    }
    const supabase = createClient();

    const { error } = await supabase
      .from("signature_fields")
      .delete()
      .eq("id", fieldId);

    if (error) {
      setFieldMessage(error.message);
      return;
    }

    setSignatureFields((current) =>
      current.filter(
        (field) => field.id !== fieldId
      )
    );

    setFieldMessage("Field removed.");
  }

  /*
   * Recipient helper
   */
  function getRecipient(
  recipientId: string
) {
  return recipients.find(
    (recipient) =>
      recipient.id === recipientId
  );
}
  /*
   * -------------------------------------------------------
   * LOADING
   * -------------------------------------------------------
   */
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />

          <p className="mt-4 text-sm text-slate-500">
            Loading document...
          </p>
        </div>
      </main>
    );
  }

  /*
   * -------------------------------------------------------
   * ERROR
   * -------------------------------------------------------
   */
  if (errorMessage || !document) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6">
          <p className="font-semibold text-red-700">
            Unable to open document
          </p>

          <p className="mt-2 text-sm text-red-600">
            {errorMessage}
          </p>

          <button
            type="button"
            onClick={() =>
              router.push("/dashboard")
            }
            className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Back to dashboard
          </button>
        </div>
      </main>
    );
  }

  /*
   * -------------------------------------------------------
   * PAGE
   * -------------------------------------------------------
   */
  return (
    <main className="min-h-screen bg-slate-100">
      {/* TOP BAR */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
        <div className="flex min-h-16 items-center justify-between px-6">
          <div className="flex min-w-0 items-center gap-5">
            <button
              type="button"
              onClick={() =>
                router.push("/dashboard")
              }
              className="text-sm font-medium text-slate-500 hover:text-slate-900"
            >
              ← Back
            </button>

            <div className="h-7 w-px bg-slate-200" />

            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="font-bold text-emerald-600">
                  OnoSign
                </span>

                <span className="text-slate-300">
                  /
                </span>

                <p className="max-w-[420px] truncate font-semibold text-slate-900">
                  {document.title}
                </p>
              </div>

              <p className="mt-0.5 text-xs text-slate-400">
                {workspaceName || "Workspace"} ·{" "}
                {document.status}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 md:block">
              {signatureFields.length} field
              {signatureFields.length !== 1
                ? "s"
                : ""}
            </span>

            <button
              type="button"
              disabled
              title="Envoi désactivé : la validation sécurisée du circuit de signature reste à développer."
              className="cursor-not-allowed rounded-xl bg-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700"
            >
              Envoi indisponible — brouillon uniquement
            </button>
          </div>
        </div>
      </header>

      {document.status === "draft" && !document.signature_blueprint_id && availableBlueprints.length > 0 && (
        <section className="border-b border-emerald-200 bg-emerald-50 px-6 py-4">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3">
            <label htmlFor="blueprint-choice" className="text-sm font-semibold text-emerald-950">
              Modèle de signature disponible
            </label>
            <select id="blueprint-choice" value={selectedBlueprint}
              onChange={(event) => setSelectedBlueprint(event.target.value)}
              className="min-w-64 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm">
              <option value="">Choisir un modèle actif…</option>
              {availableBlueprints.map((blueprint) => (
                <option key={blueprint.blueprint_id} value={blueprint.blueprint_id}>
                  {blueprint.blueprint_name}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void assignSelectedBlueprint()}
              disabled={!selectedBlueprint || assigningBlueprint || recipients.length !== 1 || signatureFields.length > 0}
              className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              {assigningBlueprint ? "Association…" : "Associer le modèle"}
            </button>
            {blueprintMessage && <p role="status" className="w-full text-sm text-emerald-950">{blueprintMessage}</p>}
          </div>
        </section>
      )}
      {document.signature_blueprint_id && document.status === "draft" && (
        <section className="border-b border-amber-200 bg-amber-50 px-6 py-4">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3">
            <div className="flex-1 text-sm text-amber-950">
              <strong>Modèle de signature associé.</strong> La génération des destinataires
              n'autorise pas l'envoi. Vérifiez le circuit et les signatures avant toute validation.
            </div>
            <button type="button" onClick={() => void populateAssignedBlueprint()}
              disabled={populatingBlueprint || recipients.length !== 1 || signatureFields.length > 0}
              className="rounded-lg bg-amber-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              {populatingBlueprint ? "Application…" : "Appliquer les signataires du modèle"}
            </button>
            {blueprintMessage && <p role="status" className="w-full text-sm text-amber-950">{blueprintMessage}</p>}
          </div>
        </section>
      )}
      {document.signature_blueprint_id && (
        <section className="border-b border-slate-200 bg-white px-6 py-4">
          <div className="mx-auto max-w-[1500px] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">Contrôle du circuit DI / DR</h2>
                <p className="text-xs text-slate-500">
                  Contrôle du circuit et de l'intégrité PDF côté serveur. L'envoi reste désactivé.
                </p>
              </div>
              <button type="button" onClick={() => void checkBlueprintPreflight()}
                disabled={preflightLoading}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40">
                {preflightLoading ? "Vérification…" : "Vérifier circuit + PDF"}
              </button>
            </div>
            {preflightError && <p role="alert" className="text-sm text-red-700">{preflightError}</p>}
            {preflight && (
              <div role="status" className={`rounded-lg border p-3 text-sm ${preflight.ready_for_review
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-amber-300 bg-amber-50 text-amber-950"}`}>
                <p className="font-semibold">{preflight.ready_for_review
                  ? "Circuit prêt pour revue — envoi toujours bloqué"
                  : "Des corrections sont nécessaires avant la revue"}</p>
                <p className="mt-1">Destinataires : {preflight.recipients} · Fondés de pouvoir : {preflight.actual_power_signers}/{preflight.required_power_signers}</p>
                <p className="mt-1">PDF original : {preflight.pdf_integrity_verified ? "Empreinte vérifiée" : "Non vérifié"}</p>
                {preflight.issues.length > 0 && (
                  <ul className="mt-2 list-inside list-disc">
                    {preflight.issues.map((issue) => (
                      <li key={issue}>{issueLabels[issue] ?? issue}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>
      )}
      {/* RECIPIENT BAR */}
      <section className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Signing order
              </p>

              <p className="text-sm font-semibold text-slate-800">
                {recipients.length} recipient
                {recipients.length !== 1
                  ? "s"
                  : ""}
              </p>
            </div>

            <div className="mx-2 hidden h-8 w-px bg-slate-200 sm:block" />

            {recipients.map((recipient) => (
              <button
                key={
                  recipient.id ??
                  recipient.email
                }
                type="button"
                onClick={() => {
                  if (recipient.id) {
                    setSelectedRecipientId(
                      recipient.id
                    );

                    setSelectedFieldType(null);
                  }
                }}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                  selectedRecipientId ===
                  recipient.id
                    ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                    selectedRecipientId ===
                    recipient.id
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {recipient.signing_order}
                </span>

                <span>
                  <span className="block text-sm font-semibold text-slate-800">
                    {recipient.name}
                  </span>

                <span className="block text-xs text-slate-400">
  {recipient.role_label || "Signer"}
  {" · "}
  {recipient.recipient_type === "signer" &&
    "✍ Doit signer"}

  {recipient.recipient_type === "cc" &&
    "📩 Reçoit une copie"}

  {recipient.recipient_type === "viewer" &&
    "👁 Doit consulter"}

  {recipient.recipient_type === "specify_recipients" &&
    "👥 Spécifie les destinataires"}

  {recipient.recipient_type === "update_recipients" &&
    "🔄 Met à jour les destinataires"}

  {recipient.recipient_type === "editor" &&
    "✏️ Autorisé à modifier"}
</span>
                </span>
              </button>
            ))}

            <button
              type="button"
              disabled={document.status !== "draft" || !!document.signature_blueprint_id}
              title={document.signature_blueprint_id ? "Les destinataires du modèle sont protégés." : undefined}
              onClick={() =>
                setShowAddSigner(
                  !showAddSigner
                )
              }
              className="rounded-xl border border-dashed border-emerald-400 px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              + Add signer
            </button>
          </div>
        </div>

        {/* ADD SIGNER FORM */}
        {showAddSigner && document.status === "draft" && !document.signature_blueprint_id && (
          <div className="mx-auto mt-4 max-w-[1500px] rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <h3 className="font-bold text-slate-900">
              Add signer
            </h3>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <label className="text-sm font-semibold text-slate-700">
                  Name
                </label>

                <input
                  type="text"
                  value={newSigner.name}
                  onChange={(event) =>
                    setNewSigner({
                      ...newSigner,
                      name: event.target.value,
                    })
                  }
                  placeholder="Example: Hotel General Manager"
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">
                  Email
                </label>

                <input
                  type="email"
                  value={newSigner.email}
                  onChange={(event) =>
                    setNewSigner({
                      ...newSigner,
                      email:
                        event.target.value,
                    })
                  }
                  placeholder="name@onomohotel.com"
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">
                  Role
                </label>

                <select
                  value={
                    newSigner.role_label
                  }
                  onChange={(event) =>
                    setNewSigner({
                      ...newSigner,
                      role_label:
                        event.target.value,
                    })
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
                >
                  <option value="">
                    Select role
                  </option>

                  <option value="Requester">
                    Requester
                  </option>

                  <option value="DG">
                    DG
                  </option>

                  <option value="RAF">
                    RAF
                  </option>

                  <option value="Finance">
                    Finance
                  </option>

                  <option value="Head Office">
                    Head Office
                  </option>

                  <option value="Other">
                    Other
                  </option>
                </select>
                <label className="mt-4 block text-sm font-semibold text-slate-700">
  Recipient action
</label>

<select
  value={newSigner.recipient_type}
  onChange={(event) =>
    setNewSigner({
      ...newSigner,
      recipient_type:
        event.target.value as Recipient["recipient_type"],
    })
  }
  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
>
  <option value="signer">
    Doit signer
  </option>

  <option value="cc">
    Reçoit une copie (CC)
  </option>

  <option value="viewer">
    Doit consulter
  </option>

  <option value="specify_recipients">
    Spécifie les destinataires
  </option>

  <option value="update_recipients">
    Met à jour les destinataires
  </option>

  <option value="editor">
    Autorisé à modifier
  </option>
</select>
              </div>
            </div>

            {recipientMessage && (
              <p className="mt-3 text-sm text-red-600">
                {recipientMessage}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() =>
                  setShowAddSigner(false)
                }
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={addSigner}
                disabled={
                  savingRecipients
                }
                className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingRecipients
                  ? "Adding..."
                  : "Add to signing order"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* EDITOR */}
      <div className="mx-auto grid max-w-[1500px] grid-cols-1 xl:grid-cols-[1fr_330px]">
        {/* PDF AREA */}
        <section className="min-w-0 bg-slate-200 p-5 md:p-8">
          {!pdfUrl ? (
            <div className="flex h-[600px] items-center justify-center">
              <p className="text-slate-500">
                PDF preview unavailable.
              </p>
            </div>
          ) : (
            <Document
              file={pdfUrl}
              onLoadSuccess={({
                numPages:
                  loadedNumPages,
              }) =>
                setNumPages(
                  loadedNumPages
                )
              }
              onLoadError={(error) =>
                setFieldMessage(
                  `PDF error: ${error.message}`
                )
              }
              loading={
                <div className="flex h-[600px] items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-emerald-600" />

                    <p className="mt-3 text-sm text-slate-500">
                      Loading PDF...
                    </p>
                  </div>
                </div>
              }
            >
              <div className="space-y-8">
                {Array.from(
                  {
                    length: numPages,
                  },
                                    (_, index) => {
                    const pageNumber = index + 1;

                    const pageFields = signatureFields.filter(
                      (field) => field.page_number === pageNumber
                    );

                    return (
                      <div
                        key={pageNumber}
                        className="mx-auto w-fit"
                      >
                        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
                          <span>PAGE {pageNumber}</span>

                          <span>
                            {pageFields.length} field
                            {pageFields.length !== 1 ? "s" : ""}
                          </span>
                        </div>

                        <div
                        data-pdf-page="true"
                          className={`relative overflow-hidden bg-white shadow-xl ${
                            selectedFieldType
                              ? "cursor-crosshair ring-2 ring-emerald-400"
                              : ""
                          }`}
  

                          onDragOver={(event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
}}
                        onDrop={(event) =>
  dropFieldOnPage(event, pageNumber)
  }
                          onClick={(event) =>
                            addFieldToPage(event, pageNumber)
                          }
                        >
                          <Page
                            pageNumber={pageNumber}
                            width={760}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                          />

                          {pageFields.map((field) => {
                            const recipient = getRecipient(
                              field.recipient_id
                            );

                            const config =
                              FIELD_CONFIG[field.field_type];

                            const isSelectedRecipient =
                              field.recipient_id ===
                              selectedRecipientId;

                            return (
                              <div
  key={field.id}
  onMouseDown={(event) =>
    moveField(event, field)
  }
  onClick={(event) =>
    event.stopPropagation()
  }
   className={`group absolute flex cursor-move select-none items-center justify-between overflow-hidden rounded border-2 px-2 text-xs font-semibold shadow-sm ${
  draggingFieldId === field.id
    ? "z-30 opacity-80"
    : "z-10"
} ${
  isSelectedRecipient
    ? "border-emerald-500 bg-emerald-100/90 text-emerald-900"
    : "border-slate-400 bg-slate-100/90 text-slate-600"
}`}
style={{
  left: `${Number(field.x) * 100}%`,
  top: `${Number(field.y) * 100}%`,
  width: `${Number(field.width) * 100}%`,
  height: `${Number(field.height) * 100}%`,
}}
>
                              
                                <span className="min-w-0 truncate">
                                  {config.icon} {config.label}

                                  {recipient && (
                                    <span className="ml-1 opacity-60">
                                      · {recipient.role_label}
                                    </span>
                                  )}
                                </span>
<div
 
  title="Resize field"
  onMouseDown={(event) =>
    resizeField(event, field)
  }
  className="absolute bottom-0 right-0 z-20 h-3 w-3 cursor-se-resize border-l border-t border-emerald-600 bg-white"
/>
                                <button
                                  type="button"
                                  title="Remove field"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    deleteField(field.id);
                                  }}
                                  className="ml-1 hidden h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-red-500 shadow group-hover:flex"
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </Document>
          )}
        </section>

        {/* RIGHT SIDEBAR */}
        <aside className="border-l border-slate-200 bg-white">
          <div className="sticky top-16 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">
              Recipient
            </p>

            {recipients.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-center">
                <p className="text-sm font-semibold text-slate-700">
                  No recipients
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Add a signer before placing fields.
                </p>
              </div>
            ) : (
              <select
                value={selectedRecipientId}
                onChange={(event) => {
                  setSelectedRecipientId(event.target.value);
                  setSelectedFieldType(null);
                }}
                className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
              >
                {recipients.map((recipient) => (
                  <option
                    key={recipient.id ?? recipient.email}
                    value={recipient.id}
                  >
                   {recipient.signing_order}. {recipient.name} —{" "}
{recipient.role_label || "Signer"} ·{" "}
{recipient.recipient_type === "signer" && "Doit signer"}
{recipient.recipient_type === "cc" && "Reçoit une copie"}
{recipient.recipient_type === "viewer" && "Doit consulter"}
{recipient.recipient_type === "specify_recipients" &&
  "Spécifie les destinataires"}
{recipient.recipient_type === "update_recipients" &&
  "Met à jour les destinataires"}
{recipient.recipient_type === "editor" &&
  "Autorisé à modifier"}
                  </option>
                ))}
              </select>
            )}

            <div className="my-6 border-t border-slate-200" />

            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              Fields
            </p>

            <p className="mt-2 text-sm text-slate-500">
              Select a field, then click where you want to place it
              on the PDF.
            </p>

            <div className="mt-4 space-y-2">
              {(Object.keys(FIELD_CONFIG) as FieldType[]).map(
                (fieldType) => {
                  const config = FIELD_CONFIG[fieldType];
                 

const fieldDisabled =
  !selectedRecipientId ||
  getRecipient(selectedRecipientId)?.recipient_type !==
    "signer";

                  const selected =
                    selectedFieldType === fieldType;

                  return (
                    <button
  key={fieldType}
  type="button"
 draggable={!fieldDisabled}
disabled={fieldDisabled}
  onDragStart={(event) => {
    event.dataTransfer.setData(
      "application/onosign-field",
      fieldType
    );

    event.dataTransfer.effectAllowed = "copy";
  }}
  onClick={() =>
    setSelectedFieldType(
      selected ? null : fieldType
    )
  }
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        selected
                          ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100"
                          : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ${
                          selected
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {config.icon}
                      </span>

                      <span className="text-sm font-semibold text-slate-800">
                        {config.label}
                      </span>

                      {selected && (
                        <span className="ml-auto text-xs font-semibold text-emerald-600">
                          Selected
                        </span>
                      )}
                    </button>
                  );
                }
              )}
            </div>

            {selectedFieldType && (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-800">
                  {FIELD_CONFIG[selectedFieldType].label} selected
                </p>

                <p className="mt-1 text-xs leading-5 text-emerald-700">
                  Now click on the PDF where this field should appear.
                </p>
              </div>
            )}

            {savingField && (
              <p className="mt-4 text-sm font-medium text-emerald-600">
                Saving field...
              </p>
            )}

            {fieldMessage && (
              <p className="mt-4 rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
                {fieldMessage}
              </p>
            )}

            <div className="my-6 border-t border-slate-200" />

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Document fields
              </p>

              <p className="mt-2 text-3xl font-bold text-slate-900">
                {signatureFields.length}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Saved in OnoSign
              </p>
            </div>

            <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-bold text-slate-900">Intégrité du PDF original</h3>
              <p className="mt-1 text-xs text-slate-500">Compare le PDF conservé sur le serveur à son empreinte SHA-256 initiale. Ce contrôle ne remplace pas une signature électronique.</p>
              <button type="button" disabled={integrityChecking}
                onClick={() => void verifyOriginalPdf()}
                className="mt-3 w-full rounded-lg border border-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50">
                {integrityChecking ? "Vérification…" : "Vérifier le PDF original"}
              </button>
              {integrityResult && <p role="status" className="mt-2 text-xs text-slate-700">{integrityResult}</p>}
            </section>

            <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-bold text-slate-900">Historique technique</h3>
              <p className="mt-1 text-xs text-slate-500">Événements depuis l’activation du journal. Ne constitue pas une preuve de signature électronique.</p>
              <a
                href={`/api/documents/${encodeURIComponent(documentId)}/audit`}
                className="mt-3 inline-flex rounded-lg border border-emerald-600 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
              >
                Exporter le rapport technique (JSON)
              </a>
              <button
                type="button"
                disabled={auditChainBusy}
                onClick={() => void verifyAuditChain()}
                className="mt-3 ml-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-50"
              >
                {auditChainBusy ? "Vérification…" : "Vérifier la chaîne SHA-256"}
              </button>
              {auditChainMessage && (
                <p role="status" className="mt-2 text-xs text-slate-700">{auditChainMessage}</p>
              )}
              {auditError && <p role="alert" className="mt-2 text-xs text-amber-700">{auditError}</p>}
              {!auditError && auditEvents.length === 0 && <p className="mt-2 text-xs text-slate-500">Aucun événement enregistré pour ce document.</p>}
              <ol className="mt-3 space-y-2">
                {auditEvents.map((event) => (
                  <li key={event.id} className="border-l-2 border-emerald-200 pl-3 text-xs text-slate-700">
                    <span className="font-semibold">{({
                      document_created: "Document créé",
                      document_status_changed: "Statut du document modifié",
                      recipient_added: "Destinataire ajouté",
                      recipient_status_changed: "Statut du destinataire modifié",
                    } as Record<string,string>)[event.event_type] ?? event.event_type}</span>
                    <div className="text-slate-500">{new Date(event.occurred_at).toLocaleString("fr-FR")}</div>
                    {event.previous_status !== event.next_status && event.previous_status && (
                      <div>{event.previous_status} → {event.next_status ?? "—"}</div>
                    )}
                  </li>
                ))}
              </ol>
            </section>

            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 block w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Open original PDF ↗
              </a>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
                 