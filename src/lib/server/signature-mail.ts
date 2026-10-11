/**
 * Transactional mail composition only. This module never sends messages.
 * Delivery requires a verified sender, an approved mail provider and a
 * separate privileged worker consuming the private database outbox.
 */
export type InvitationMail = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;",
  }[char] as string));
}

/** Only configured HTTPS origins may appear in signer invitations. */
export function signerPortalUrl(
  appOrigin: string,
  documentId: string
): string {
  const origin = new URL(appOrigin);
  if (origin.protocol !== "https:" || origin.username || origin.password ||
      origin.search || origin.hash || origin.pathname !== "/") {
    throw new Error("A public HTTPS application origin is required");
  }
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(documentId)) {
    throw new Error("Invalid document identifier");
  }
  return new URL(`/sign/${documentId}`, origin).toString();
}

export function renderOnoSignInvitation(input: {
  recipientName: string;
  organizationName: string;
  documentTitle: string;
  appOrigin: string;
  documentId: string;
  expiry?: string | null;
}): InvitationMail {
  const { recipientName, organizationName, documentTitle, appOrigin, documentId, expiry } = input;
  if (!recipientName.trim() || !organizationName.trim() || !documentTitle.trim()) {
    throw new Error("Invitation names and document title are required");
  }
  const url = new URL(signerPortalUrl(appOrigin, documentId));
  const limit = expiry ? Date.parse(expiry) : null;
  if (expiry && (limit === null || !Number.isFinite(limit))) {
    throw new Error("Invalid invitation expiration");
  }
  const subject = "OnoSign — Document en attente de signature";
  const expiresText = expiry
    ? `Expiration : ${new Date(limit as number).toISOString()}.\n`
    : "";
  const text = [
    `Bonjour ${recipientName.trim()},`,
    "",
    `${organizationName.trim()} sollicite votre signature pour un document : ${documentTitle.trim()}.`,
    "Connectez-vous avec l'adresse e-mail du destinataire pour accéder à votre demande.",
    `Ouvrir OnoSign : ${url.toString()}`,
    expiresText.trim(),
    "Ne transférez pas cette invitation. En cas de doute, contactez votre service administratif.",
  ].filter(Boolean).join("\n");
  const html = [
    '<!doctype html><html lang="fr"><body style="font:16px Arial,sans-serif;color:#0f172a">',
    '<div style="max-width:620px;margin:0 auto;padding:26px">',
    '<h1 style="color:#059669">OnoSign · ONOMO HOTELS</h1>',
    `<p>Bonjour ${escapeHtml(recipientName.trim())},</p>`,
    `<p><strong>${escapeHtml(organizationName.trim())}</strong> sollicite votre signature pour le document <strong>${escapeHtml(documentTitle.trim())}</strong>.</p>`,
    '<p>Connectez-vous avec l’adresse e-mail du destinataire pour accéder à la demande.</p>',
    `<p><a style="display:inline-block;padding:12px 18px;background:#047857;color:#fff;text-decoration:none;border-radius:8px" href="${escapeHtml(url.toString())}">Consulter dans OnoSign</a></p>`,
    expiry ? `<p>Expiration : ${escapeHtml(new Date(limit as number).toISOString())}</p>` : "",
    "<p>Ne transférez pas cette invitation. En cas de doute, contactez votre service administratif.</p>",
    "</div></body></html>",
  ].join("");
  return { subject, text, html };
}

export function retryDelaySeconds(attempt: number): number {
  if (!Number.isSafeInteger(attempt) || attempt < 0) {
    throw new Error("Invalid delivery attempt");
  }
  return Math.min(60 * Math.pow(2, Math.min(attempt, 10)), 3600 * 6);
}
