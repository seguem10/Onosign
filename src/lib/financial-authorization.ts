/**
 * OnoSign — pure financial authorization validation.
 *
 * Call this on the trusted server when preparing a DI for dispatch.
 * It does not send a document and is not a replacement for the final
 * transactional status/recipient checks in PostgreSQL.
 */
export type PowerSigner = {
  id: string;
  email: string | null;
  role: "power_of_attorney" | "other";
  action: "signer" | "cc";
  enabled: boolean;
};

export type FinancialAuthorization = {
  documentType: "DI" | "DR";
  amountEur: number | null;
  thresholdEur: number | null;
  recipients: readonly PowerSigner[];
};

export type FinancialCheck =
  | { ok: true; requiredPowers: number }
  | { ok: false; reason: string; requiredPowers: number };

export function validateFinancialAuthorization(
  input: FinancialAuthorization
): FinancialCheck {
  if (input.documentType === "DR") return { ok: true, requiredPowers: 0 };
  const { amountEur, thresholdEur } = input;
  if (amountEur === null || !Number.isFinite(amountEur) || amountEur < 0) {
    return { ok: false, reason: "Montant DI invalide.", requiredPowers: 0 };
  }
  if (thresholdEur === null || !Number.isFinite(thresholdEur) || thresholdEur <= 0) {
    return { ok: false, reason: "Seuil DI invalide.", requiredPowers: 0 };
  }
  const requiredPowers = amountEur >= thresholdEur ? 2 : 1;
  const eligible = input.recipients.filter(
    (recipient) =>
      recipient.role === "power_of_attorney" &&
      recipient.action === "signer" &&
      recipient.enabled &&
      !!recipient.email?.trim()
  );
  const uniqueIds = new Set(eligible.map((recipient) => recipient.id));
  const uniqueEmails = new Set(eligible.map((recipient) => recipient.email!.trim().toLowerCase()));
  if (uniqueIds.size < requiredPowers || uniqueEmails.size < requiredPowers) {
    return {
      ok: false,
      requiredPowers,
      reason: `Cette DI nécessite ${requiredPowers} fondé(s) de pouvoir distinct(s).`,
    };
  }
  return { ok: true, requiredPowers };
}
