/**
 * Pure email copy builder. No provider API key, sender token or confidential
 * storage URL is ever included in the message.
 */
export type SigningEmail = {
  from: string;
  to: string[];
  subject: string;
  text: string;
};

export function createSigningInvitationEmail(input: {
  documentId: string;
  documentTitle: string;
  recipientEmail: string;
  recipientName: string;
  from: string;
  appUrl: string;
}): SigningEmail {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.documentId)) {
    throw new Error("invalid_document_id");
  }
  const email = input.recipientEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("invalid_recipient_email");
  }
  if (/[\r\n]/.test(input.from) || !input.from.includes("@") || input.from.length > 200) {
    throw new Error("invalid_sender_identity");
  }
  const origin = new URL(input.appUrl);
  if (origin.protocol !== "https:" || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("invalid_app_origin");
  }
  const url = new URL(`/sign/${input.documentId}`, origin);
  const person = input.recipientName.replace(/[\r\n]/g, " ").trim().slice(0, 100);
  const title = input.documentTitle.replace(/[\r\n]/g, " ").trim().slice(0, 180);
  return {
    from: input.from,
    to: [email],
    subject: "OnoSign ONOMO HOTELS — document à signer",
    text: [
      `Bonjour ${person || "collaborateur"},`,
      "",
      "Une demande de signature ONOMO vous est adressée :",
      title,
      "",
      "Connectez-vous avec l'adresse e-mail vérifiée destinataire de ce message.",
      "L'accès au document est réservé au signataire identifié :",
      url.toString(),
      "",
      "Ne transmettez pas ce message. Si la demande est inattendue, contactez votre équipe IT.",
      "OnoSign — ONOMO HOTELS",
    ].join("\n"),
  };
}
