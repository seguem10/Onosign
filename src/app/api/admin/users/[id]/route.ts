import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Vérifier la session
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: "Connexion requise." },
        { status: 401 }
      );
    }

    // 2. Vérifier les droits administrateur
    const { data: membership, error: membershipError } =
      await supabase
        .from("organization_members")
        .select("organization_id, role")
        .eq("user_id", user.id)
        .in("role", ["owner", "admin"])
        .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json(
        {
          success: false,
          message: "Accès administrateur requis.",
        },
        { status: 403 }
      );
    }

    // 3. Récupérer l'utilisateur à modifier
    const { id: targetUserId } = await context.params;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId)) {
      return NextResponse.json(
        { success: false, message: "Identifiant invalide." },
        { status: 400 }
      );
    }

    const body = await request.json();

   const {
  fullName,
  jobTitle,
  department,
  phone,
  primaryWorkspaceId,
} = body;

    if (
      typeof fullName !== "string" ||
      !fullName.trim() ||
      fullName.trim().length > 150 ||
      [jobTitle, department, phone].some(
        (value) => value !== undefined && typeof value !== "string"
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Informations utilisateur invalides.",
        },
        { status: 400 }
      );
    }

    // 4. Client administrateur, uniquement côté serveur
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // 5. Vérifier que l'utilisateur appartient à la même organisation
    const { data: targetMembership, error: targetError } =
      await supabaseAdmin
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", membership.organization_id)
        .eq("user_id", targetUserId)
        .maybeSingle();

    if (targetError || !targetMembership) {
      return NextResponse.json(
        {
          success: false,
          message: "Utilisateur introuvable dans votre organisation.",
        },
        { status: 404 }
      );
    }
// Vérifier l'établissement principal demandé
if (primaryWorkspaceId !== undefined) {
  if (
    typeof primaryWorkspaceId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(primaryWorkspaceId)
  ) {
    return NextResponse.json(
      {
        success: false,
        message: "Établissement principal invalide.",
      },
      { status: 400 }
    );
  }

  const { data: workspace, error: workspaceError } =
    await supabaseAdmin
      .from("workspaces")
      .select("id, type, is_active")
      .eq("id", primaryWorkspaceId)
      .eq("organization_id", membership.organization_id)
      .in("type", ["hotel", "head_office"])
      .eq("is_active", true)
      .maybeSingle();

  if (workspaceError || !workspace) {
    return NextResponse.json(
      {
        success: false,
        message: "Établissement introuvable ou non autorisé.",
      },
      { status: 400 }
    );
  }
}
    // Préparer les informations à modifier
    // Récupérer l'établissement principal actuel
const { data: currentProfile, error: currentProfileError } =
  await supabaseAdmin
    .from("profiles")
    .select("primary_workspace_id")
    .eq("id", targetUserId)
    .single();

if (currentProfileError || !currentProfile) {
  return NextResponse.json(
    {
      success: false,
      message: "Impossible de récupérer le profil actuel.",
    },
    { status: 404 }
  );
}
// Récupérer les établissements auxquels l'utilisateur a accès
const { data: currentAccesses, error: accessesError } =
  await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", targetUserId);

if (accessesError) {
  console.error("Erreur récupération des accès :", accessesError);

  return NextResponse.json(
    {
      success: false,
      message: "Impossible de récupérer les accès utilisateur.",
    },
    { status: 500 }
  );
}

const existingWorkspaceIds = new Set(
  (currentAccesses || []).map((access) => access.workspace_id)
);
const previousWorkspaceId = currentProfile.primary_workspace_id;

const workspaceChanged =
  primaryWorkspaceId !== undefined &&
  primaryWorkspaceId !== previousWorkspaceId;
  // Préparer l'accès au nouvel établissement principal
if (workspaceChanged && primaryWorkspaceId) {
  // Vérifier si l'utilisateur possède déjà cet accès
  const hasNewWorkspaceAccess =
    existingWorkspaceIds.has(primaryWorkspaceId);

  if (!hasNewWorkspaceAccess) {
    const { error: newAccessError } = await supabaseAdmin
      .from("workspace_members")
      .insert({
        workspace_id: primaryWorkspaceId,
        user_id: targetUserId,
        role: "member",
      });

    if (newAccessError) {
      console.error(
        "Erreur attribution nouvel établissement :",
        newAccessError
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Impossible d'attribuer l'accès au nouvel établissement.",
        },
        { status: 500 }
      );
    }
  }
}
const profileUpdates: {
  full_name: string;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  primary_workspace_id?: string;
} = {
  full_name: fullName.trim(),
  job_title: jobTitle?.trim() || null,
  department: department?.trim() || null,
  phone: phone?.trim() || null,
};

// Ajouter le nouvel établissement principal si demandé
if (primaryWorkspaceId !== undefined) {
  profileUpdates.primary_workspace_id = primaryWorkspaceId;
}

// Enregistrer les modifications
const { error: updateError } = await supabaseAdmin
  .from("profiles")
  .update(profileUpdates)
  .eq("id", targetUserId);

    if (updateError) {
      console.error("Profile update error:", updateError);

      return NextResponse.json(
        {
          success: false,
          message: "Impossible de modifier le profil.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Utilisateur modifié avec succès.",
    });
  } catch (error) {
    console.error("Update OnoSign user error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Erreur serveur.",
      },
      { status: 500 }
    );
  }
}