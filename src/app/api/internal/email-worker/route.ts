import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSigningInvitationEmail } from "@/lib/server/signing-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };

type EmailJob = {
  job_id: string;
  document_id: string;
  recipient_email: string;
  recipient_name: string;
  document_title: string;
};

function authenticated(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24) return false;
  const received = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const x = Buffer.from(received);
  const y = Buffer.from(expected);
  return x.length === y.length && timingSafeEqual(x, y);
}

function unavailable(status: number) {
  return NextResponse.json({ message: "Traitement des e-mails indisponible." }, { status, headers: noStore });
}

/**
 * Gated, service-only outbox worker. This endpoint never changes document or
 * signature status; it can only deliver jobs created by database transitions.
 * No provider credentials are set in the Preview environment by default.
 */
async function processOutbox(request: Request) {
  if (!authenticated(request)) return unavailable(401);
  if (process.env.ONOSIGN_EMAIL_WORKER_ENABLED !== "true") return unavailable(503);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.ONOSIGN_EMAIL_FROM;
  const appUrl = process.env.ONOSIGN_APP_URL;
  if (!url || !serviceKey || !resendKey || !from || !appUrl) return unavailable(503);

  try {
    const origin = new URL(appUrl);
    if (origin.protocol !== "https:" || origin.username || origin.password ||
        origin.pathname !== "/" || origin.search || origin.hash ||
        /[\r\n]/.test(from) || !from.includes("@")) return unavailable(503);
  } catch {
    return unavailable(503);
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: claimed, error: claimError } = await db.rpc(
    "onosign_claim_email_jobs", { p_limit: 3 }
  );
  if (claimError) return unavailable(503);

  let delivered = 0;
  let retry = 0;
  let manualReview = 0;
  let failedToRecord = 0;

  for (const job of (claimed ?? []) as EmailJob[]) {
    let outcome: "delivered" | "retry" | "manual_review" = "manual_review";
    let providerId: string | null = null;
    let code = "unknown_delivery";
    try {
      const email = createSigningInvitationEmail({
        documentId: job.document_id,
        documentTitle: job.document_title,
        recipientName: job.recipient_name,
        recipientEmail: job.recipient_email,
        appUrl,
        from,
      });
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `onosign-invitation/${job.job_id}`,
        },
        body: JSON.stringify(email),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (response.ok) {
        const result = await response.json() as { id?: string };
        if (typeof result.id === "string" && result.id.length > 0) {
          providerId = result.id;
          outcome = "delivered";
          code = "";
        } else {
          code = "missing_provider_reference";
        }
      } else if (response.status === 429) {
        outcome = "retry";
        code = "provider_rate_limited";
      } else {
        // An unknown 5xx/timeout may actually have delivered. Do not blindly
        // retry and send multiple signing invitations.
        code = `provider_status_${response.status}`;
      }
    } catch {
      code = "delivery_uncertain";
    }

    const { data: recorded, error: recordError } = await db.rpc(
      "onosign_finish_email_job",
      {
        p_job_id: job.job_id,
        p_status: outcome,
        p_provider_email_id: providerId,
        p_error: code || null,
      }
    );
    if (recordError || !recorded) {
      failedToRecord++;
      continue;
    }
    if (outcome === "delivered") delivered++;
    else if (outcome === "retry") retry++;
    else manualReview++;
  }

  return NextResponse.json(
    { claimed: (claimed ?? []).length, delivered, retry, manualReview, failedToRecord },
    { status: failedToRecord > 0 ? 503 : 200, headers: noStore }
  );
}

export async function GET(request: Request) {
  return processOutbox(request);
}
export async function POST(request: Request) {
  return processOutbox(request);
}
