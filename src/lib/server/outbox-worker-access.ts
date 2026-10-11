import { timingSafeEqual } from "node:crypto";

export type OutboxWorkerGate = "authorized" | "disabled" | "configuration" | "forbidden";

export function checkOutboxWorkerAccess(input: {
  authorizationHeader: string | null;
  expectedSecret: string | undefined;
  deliveryEnabled: string | undefined;
  signatureDispatchEnabled: string | undefined;
  supabaseServiceKey: string | undefined;
  resendApiKey: string | undefined;
  senderEmail: string | undefined;
  appOrigin: string | undefined;
}): OutboxWorkerGate {
  if (
    input.deliveryEnabled !== "true" ||
    input.signatureDispatchEnabled !== "true"
  ) return "disabled";

  const expected = input.expectedSecret?.trim() ?? "";
  const provided = input.authorizationHeader?.startsWith("Bearer ")
    ? input.authorizationHeader.slice(7)
    : "";
  if (
    expected.length < 32 ||
    !input.supabaseServiceKey?.trim() ||
    !input.resendApiKey?.startsWith("re_") ||
    !input.senderEmail?.trim() ||
    !input.appOrigin?.startsWith("https://")
  ) return "configuration";

  const actualBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) return "forbidden";

  return "authorized";
}
