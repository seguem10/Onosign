import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const failure = (message: string, status: number) =>
  NextResponse.json({ success: false, message }, { status });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  const blueprintId = url.searchParams.get("blueprintId");
  if (!workspaceId || !blueprintId ||
      !/^[0-9a-f-]{36}$/i.test(workspaceId) || !/^[0-9a-f-]{36}$/i.test(blueprintId)) {
    return failure("Identifiants invalides.", 400);
  }

  const supabase = await createServerSupabaseClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return failure("Session expirée.", 401);

  const { data: admin, error: adminError } = await supabase
    .from("organization_members").select("organization_id")
    .eq("user_id", auth.user.id).in("role", ["owner", "admin"]);
  if (adminError || !admin?.length) return failure("Accès administrateur requis.", 403);

  const [w, b, o] = await Promise.all([
    supabase.from("workspaces").select("id,organization_id,type,name")
      .eq("id", workspaceId).maybeSingle(),
    supabase.from("signature_blueprints")
      .select("id,organization_id,name,document_type,scope,is_active,financial_threshold_eur,signature_blueprint_steps(id,step_order,role_label,default_name,default_email,recipient_type,is_requester,is_required,condition_type)")
      .eq("id", blueprintId).maybeSingle(),
    supabase.from("signature_blueprint_overrides")
      .select("id,is_enabled,signature_blueprint_step_overrides(step_id,default_name,default_email,is_enabled)")
      .eq("workspace_id", workspaceId).eq("blueprint_id", blueprintId).maybeSingle(),
  ]);
  if (w.error || b.error || o.error) return failure("Impossible de charger le circuit.", 500);
  if (!w.data || !b.data) return failure("Modèle ou établissement introuvable.", 404);
  if (w.data.organization_id !== b.data.organization_id ||
      !admin.some((membership) => membership.organization_id === w.data.organization_id))
    return failure("Établissement non autorisé.", 403);
  if (!["hotel", "head_office", "head_office_department", "sarh"].includes(w.data.type) ||
      (w.data.type === "hotel" ? "hotels" : "head_office") !== b.data.scope)
    return failure("Périmètre incompatible.", 400);

  const overrides = o.data?.signature_blueprint_step_overrides ?? [];
  const steps = [...(b.data.signature_blueprint_steps ?? [])]
    .sort((a, b) => a.step_order - b.step_order)
    .map((step) => {
      const change = overrides.find((item) => item.step_id === step.id);
      return {
        id: step.id, step_order: step.step_order, role_label: step.role_label,
        recipient_type: step.recipient_type, is_requester: step.is_requester,
        is_required: step.is_required, condition_type: step.condition_type,
        name: step.is_requester ? null : (change?.default_name ?? step.default_name),
        email: step.is_requester ? null : (change?.default_email ?? step.default_email),
        enabled: step.is_required || step.is_requester ? true :
          ((o.data?.is_enabled ?? true) && (change?.is_enabled ?? true)),
      };
    });

  // Preview only: this endpoint cannot create recipients or dispatch a document.
  return NextResponse.json({
    success: true,
    workspace: { id: w.data.id, name: w.data.name },
    blueprint: {
      id: b.data.id, name: b.data.name, document_type: b.data.document_type,
      active: b.data.is_active && (o.data?.is_enabled ?? true),
      threshold_eur: b.data.financial_threshold_eur,
    },
    steps,
  }, { headers: { "Cache-Control": "no-store" } });
}
