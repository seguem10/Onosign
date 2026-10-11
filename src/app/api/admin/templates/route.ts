import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type StepInput = {
  role: string; name: string; email: string;
  action: "signer" | "cc";
  condition: "always" | "it" | "above_threshold" | "above_20k_strict";
  required: boolean; is_requester: boolean;
  authorization_role: "none" | "power_of_attorney";
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fail = (message: string, status: number) =>
  NextResponse.json({ success: false, message }, { status });

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return fail("Session expirée.", 401);

    const { data: memberships, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id,role")
      .eq("user_id", auth.user.id)
      .in("role", ["owner", "admin"]);
    if (membershipError) return fail("Impossible de vérifier les droits administrateur.", 403);
    if (!memberships || memberships.length !== 1)
      return fail("Un seul rattachement administrateur est nécessaire.", 403);

    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      return fail("Données invalides.", 400);
    const payload = body as Record<string, unknown>;
    const name = payload.name;
    const type = payload.document_type;
    const scope = payload.scope;
    const threshold = payload.threshold_eur;
    const rawSteps = payload.steps;
    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 160)
      return fail("Nom du modèle invalide.", 400);
    if (type !== "DI" && type !== "DR") return fail("Type DI/DR invalide.", 400);
    if (scope !== "hotels" && scope !== "head_office") return fail("Périmètre invalide.", 400);
    if (type === "DI" && (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold <= 0 || threshold > 999999999999 || Math.abs(threshold * 100 - Math.round(threshold * 100)) > 1e-7))
      return fail("Seuil financier invalide.", 400);
    if (type === "DR" && threshold !== null) return fail("Aucun seuil autorisé pour DR.", 400);
    if (!Array.isArray(rawSteps) || rawSteps.length < 1 || rawSteps.length > 30)
      return fail("Le circuit doit contenir entre 1 et 30 étapes.", 400);

    const steps: StepInput[] = [];
    for (const [index, raw] of rawSteps.entries()) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return fail("Étape invalide.", 400);
      const step = raw as Record<string, unknown>;
      if (typeof step.role !== "string" || !step.role.trim() || step.role.length > 120 ||
          typeof step.name !== "string" || step.name.length > 200 ||
          typeof step.email !== "string" || step.email.length > 254 ||
          (step.email.trim() && !emailPattern.test(step.email.trim())) ||
          (step.action !== "signer" && step.action !== "cc") ||
          !["always", "it", "above_threshold", "above_20k_strict"].includes(String(step.condition)) ||
          typeof step.required !== "boolean" || typeof step.is_requester !== "boolean" ||
          !["none","power_of_attorney"].includes(String(step.authorization_role ?? "none")))
        return fail(`Étape ${index + 1} invalide.`, 400);
      if (step.condition === "above_threshold" && type !== "DI")
        return fail("Condition financière réservée aux DI.", 400);
      if (step.condition === "above_20k_strict" && (type !== "DR" || step.action !== "signer" || !step.required || index === 0))
        return fail("Le deuxième directeur conditionnel doit être un signataire DR obligatoire.", 400);
      if (step.is_requester !== (index === 0))
        return fail("Le demandeur doit être la première et unique étape demandeur.", 400);
      if (index === 0 && (!step.required || step.action !== "signer" || step.condition !== "always" || step.name || step.email))
        return fail("Le demandeur doit signer en premier avec son identité de session.", 400);
      if (step.action === "cc" && step.required)
        return fail("Une copie CC ne peut pas être une signature obligatoire.", 400);
      if (step.authorization_role === "power_of_attorney" &&
          (type !== "DI" || index === 0 || step.action !== "signer" || !step.required || step.condition === "it"))
        return fail("Le fondé de pouvoir doit être un signataire DI obligatoire.", 400);
      steps.push({
        role: step.role.trim(), name: step.name.trim(), email: step.email.trim(),
        action: step.action, condition: step.condition as StepInput["condition"],
        required: step.required, is_requester: step.is_requester,
        authorization_role: (step.authorization_role ?? "none") as StepInput["authorization_role"],
      });
    }

    // Atomic creation is performed exclusively by the database RPC.
    // No service-role key or direct multi-table insert is used here.
    const { data, error } = await supabase.rpc("onosign_create_blueprint", {
      p_name: name.trim(),
      p_document_type: type,
      p_scope: scope,
      p_threshold_eur: type === "DI" ? threshold : null,
      p_steps: steps,
    });
    if (error) {
      console.error("Blueprint RPC error", error.code);
      return fail("Enregistrement indisponible. Vérifiez la fonction SQL de création.", 503);
    }
    return NextResponse.json({ success: true, id: data }, { status: 201 });
  } catch {
    return fail("Impossible de traiter cette demande.", 400);
  }
}
