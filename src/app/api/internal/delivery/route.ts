import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkOutboxWorkerAccess } from "@/lib/server/outbox-worker-access";
import { renderOnoSignInvitation } from "@/lib/server/signature-mail";
import { sendViaResend } from "@/lib/server/resend-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noCache = { "Cache-Control": "private, no-store" };
type QueueJob = {
  job_id: string;
  document_id: string;
  recipient_email: string;
  recipient_name: string;
  document_title: string;
};

function unavailable(status: number) {
  return NextResponse.json(
    { message: "Delivery worker unavailable." },
    { status, headers: noCache }
  );
}

/**
 * Dormant until BOTH flags and a dedicated long random CRON secret exist.
 * Service credentials are never sent to the browser or stored in Supabase.
 * The DB leases committed jobs before a provider is contacted.
 */
export async function POST(request: Request) {
  const gate = checkOutboxWorkerAccess({
    authorizationHeader: request.headers.get("authorization"),
    expectedSecret: process.env.ONOSIGN_OUTBOX_WORKER_SECRET,
    deliveryEnabled: process.env.ONOSIGN_EMAIL_DELIVERY_ENABLED,
    signatureDispatchEnabled: process.env.ONOSIGN_SIGNATURE_DISPATCH_ENABLED,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    resendApiKey: process.env.RESEND_API_KEY,
    senderEmail: process.env.ONOSIGN_SENDER_EMAIL,
    appOrigin: process.env.ONOSIGN_APP_ORIGIN,
  });
  if (gate !== "authorized") return unavailable(gate === "disabled" ? 423 : 403);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return unavailable(503);
  const supabase = createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data: jobs, error: claimError } = await supabase
    .rpc("onosign_claim_email_jobs", { p_limit: 5 });
  if (claimError || !Array.isArray(jobs)) return unavailable(503);

  const counters = { claimed: jobs.length, delivered: 0, retried: 0, manual_review: 0 };
  async function finish(jobId: string, status: "delivered" | "retry" | "manual_review",
    providerId?: string, reason?: string) {
    const { data, error } = await supabase.rpc("onosign_finish_email_job", {
      p_job_id: jobId,
      p_status: status,
      p_provider_email_id: providerId ?? null,
      p_error: reason ?? null,
    });
    if (!error && data === true) {
      if (status === "delivered") counters.delivered += 1;
      else if (status === "retry") counters.retried += 1;
      else counters.manual_review += 1;
    }
  }

  for (const job of jobs as QueueJob[]) {
    try {
      const [{ data: outbox }, { data: doc }] = await Promise.all([
        supabase.from("onosign_email_outbox")
          .select("recipient_id,status").eq("id", job.job_id).maybeSingle(),
        supabase.from("documents")
          .select("id,organization_id,status,document_type,signature_blueprint_id,original_sha256,expires_at")
          .eq("id", job.document_id).maybeSingle(),
      ]);
      if (!outbox || outbox.status !== "sending" ||
          !doc || !doc.signature_blueprint_id ||
          !["DI", "DR"].includes(doc.document_type) ||
          !["sent", "viewed", "partially_signed"].includes(doc.status) ||
          !/^[a-f0-9]{64}$/.test(doc.original_sha256 ?? "") ||
          (doc.expires_at && new Date(doc.expires_at).getTime() <= Date.now())) {
        await finish(job.job_id, "manual_review", undefined, "inactive_or_invalid_document");
        continue;
      }
      const [{ data: recipient }, { data: organization }] = await Promise.all([
        supabase.from("recipients")
          .select("id,recipient_type,status,email,signing_order")
          .eq("id", outbox.recipient_id).eq("document_id", doc.id).maybeSingle(),
        supabase.from("organizations").select("name")
          .eq("id", doc.organization_id).maybeSingle(),
      ]);
      if (!recipient || recipient.recipient_type !== "signer" ||
          !["sent", "viewed"].includes(recipient.status) ||
          recipient.email?.trim().toLowerCase() !== job.recipient_email ||
          !Number.isSafeInteger(recipient.signing_order) ||
          !organization?.name) {
        await finish(job.job_id, "manual_review", undefined, "recipient_mismatch");
        continue;
      }
      const { data: earlier, error: earlierError } = await supabase
        .from("recipients").select("status,recipient_type")
        .eq("document_id", doc.id).lt("signing_order", recipient.signing_order);
      if (earlierError || (earlier ?? []).some((r) =>
        r.recipient_type === "signer" && r.status !== "signed"
      )) {
        await finish(job.job_id, "manual_review", undefined, "signing_order_not_ready");
        continue;
      }

      const mail = renderOnoSignInvitation({
        recipientName: job.recipient_name,
        organizationName: organization.name,
        documentTitle: job.document_title,
        appOrigin: process.env.ONOSIGN_APP_ORIGIN!,
        documentId: doc.id,
        expiry: doc.expires_at,
      });
      const response = await sendViaResend(
        { outboxId: job.job_id, recipientEmail: job.recipient_email, mail },
        {
          enabled: true,
          apiKey: process.env.RESEND_API_KEY,
          verifiedSender: process.env.ONOSIGN_SENDER_EMAIL,
        }
      );
      if (response.delivered) {
        await finish(job.job_id, "delivered", response.providerMessageId);
      } else {
        await finish(job.job_id, response.retryable ? "retry" : "manual_review",
          undefined, response.reason);
      }
    } catch {
      await finish(job.job_id, "retry", undefined, "worker_exception");
    }
  }
  return NextResponse.json(counters, { headers: noCache });
}
