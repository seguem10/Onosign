import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  let createdUserId: string | null = null;

  try {
    // 1. Vérifier l'utilisateur actuellement connecté
   const supabase = await createServerSupabaseClient();

    const {
      data: { user: currentUser },
      error: currentUserError,
    } = await supabase.auth.getUser();

    if (currentUserError || !currentUser) {
      return NextResponse.json(
        {
          success: false,
          message: "Vous devez être connecté.",
        },
        { status: 401 }
      );
    }

    // 2. Vérifier qu'il est propriétaire/admin de l'organisation
    const { data: currentMembership, error: membershipError } =
      await supabase
        .from("organization_members")
        .select("organization_id, role")
        .eq("user_id", currentUser.id)
        .single();

    if (membershipError || !currentMembership) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Impossible de vérifier vos droits ONOMO HOTELS.",
        },
        { status: 403 }
      );
    }

    if (
      currentMembership.role !== "owner" &&
      currentMembership.role !== "admin"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Vous n'avez pas l'autorisation de créer des utilisateurs.",
        },
        { status: 403 }
      );
    }

    // 3. Lire le formulaire
    const body = await request.json();

    const {
      fullName,
      email,
      password,
      jobTitle,
      department,
      primaryWorkspaceId,
      primaryDepartmentId,
      selectedWorkspaceIds,
      accessRole,
    } = body;

    if (
      !fullName?.trim() ||
      !email?.trim() ||
      !password ||
      !primaryWorkspaceId
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Nom, email, mot de passe et établissement principal sont obligatoires.",
        },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Le mot de passe doit contenir au moins 8 caractères.",
        },
        { status: 400 }
      );
    }

   // Les comptes génériques ne peuvent pas être administrateurs
if (accessRole !== "member") {
  return NextResponse.json(
    {
      success: false,
      message:
        "Un compte générique doit avoir le rôle membre.",
    },
    { status: 400 }
  );
}

    // 4. Client Supabase Service Role
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

    const organizationId =
      currentMembership.organization_id;

    // 5. Vérifier l'établissement principal
    const { data: primaryWorkspace } =
      await supabaseAdmin
        .from("workspaces")
        .select("id, organization_id, type")
        .eq("id", primaryWorkspaceId)
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .maybeSingle();

    if (
  !primaryWorkspace ||
  ![
    "hotel",
    "head_office_department",
    "sarh",
  ].includes(primaryWorkspace.type)
) {
  return NextResponse.json(
    {
      success: false,
      message:
        "Espace OnoSign invalide ou non autorisé.",
    },
    { status: 400 }
  );
}

    // 6. Vérifier le département principal si fourni
    if (primaryDepartmentId) {
      const { data: primaryDepartment } =
        await supabaseAdmin
          .from("workspaces")
          .select(
            "id, organization_id, parent_workspace_id, type"
          )
          .eq("id", primaryDepartmentId)
          .eq("organization_id", organizationId)
          .eq(
            "parent_workspace_id",
            primaryWorkspaceId
          )
          .eq("is_active", true)
          .maybeSingle();

      if (
        !primaryDepartment ||
        primaryDepartment.type !==
          "head_office_department"
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Département principal invalide.",
          },
          { status: 400 }
        );
      }
    }

    // 7. Créer le compte Supabase Auth
    const {
      data: authData,
      error: authError,
    } =
      await supabaseAdmin.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName.trim(),
        },
      });

    if (authError || !authData.user) {
      console.error(
        "Auth user creation error:",
        authError
      );

      return NextResponse.json(
        {
          success: false,
          message:
            authError?.message ||
            "Impossible de créer le compte.",
        },
        { status: 400 }
      );
    }

    createdUserId = authData.user.id;

   // 8. Créer / compléter le profil
const { error: profileError } =
  await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        id: createdUserId,
        full_name: fullName.trim(),
        job_title: jobTitle?.trim() || null,
        department: department?.trim() || null,
        country_code: "MA",
        preferred_language: "fr",
        is_active: true,

        // Rattachement principal OnoSign
        primary_workspace_id: primaryWorkspaceId,
        primary_department_id:
          primaryDepartmentId || null,
      },
      {
        onConflict: "id",
      }
    );

if (profileError) {
  throw new Error(
    `Profil : ${profileError.message}`
  );
}

   // 9. Ajouter le compte générique à ONOMO HOTELS
// Sans privilèges d'administration centrale
const { error: organizationError } =
  await supabaseAdmin
    .from("organization_members")
    .insert({
      organization_id: organizationId,
      user_id: createdUserId,
      role: "member",
    });

if (organizationError) {
  throw new Error(
    `Organisation : ${organizationError.message}`
  );
}

   // 10. Un compte générique possède un seul espace OnoSign
// Refuser toute demande d'accès supplémentaire

if (
  primaryDepartmentId ||
  (Array.isArray(selectedWorkspaceIds) &&
    selectedWorkspaceIds.length > 0)
) {
  return NextResponse.json(
    {
      success: false,
      message:
        "Un compte générique ne peut avoir qu'un seul espace OnoSign.",
    },
    { status: 400 }
  );
}

   // 11. Vérifier que le compte générique possède
// uniquement son espace principal ONOMO HOTELS

const requestedWorkspaceIds = [primaryWorkspaceId];

const { data: validWorkspaces, error: workspaceError } =
  await supabaseAdmin
    .from("workspaces")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .in("id", requestedWorkspaceIds);

if (workspaceError) {
  throw new Error(
    `Workspaces : ${workspaceError.message}`
  );
}

if (
  !validWorkspaces ||
  validWorkspaces.length !== 1
) {
  throw new Error(
    "L'espace principal du compte générique est invalide."
  );
}

   // Un compte générique possède un seul espace
const workspaceMemberships = [
  {
    workspace_id: primaryWorkspaceId,
    user_id: createdUserId,
    role: "member",
  },
];

    const { error: workspaceMemberError } =
      await supabaseAdmin
        .from("workspace_members")
        .insert(workspaceMemberships);

    if (workspaceMemberError) {
      throw new Error(
        `Accès : ${workspaceMemberError.message}`
      );
    }

    // 13. Succès
    return NextResponse.json({
      success: true,
      message:
        "Utilisateur OnoSign créé avec succès.",
      user: {
        id: createdUserId,
        email: authData.user.email,
        fullName: fullName.trim(),
      },
    });
  } catch (error) {
    console.error(
      "Create OnoSign user error:",
      error
    );

    // Nettoyage si la création a échoué après Auth
    if (createdUserId) {
      try {
        const supabaseAdmin =
          createAdminClient(
            process.env
              .NEXT_PUBLIC_SUPABASE_URL!,
            process.env
              .SUPABASE_SERVICE_ROLE_KEY!
          );

        await supabaseAdmin.auth.admin.deleteUser(
          createdUserId
        );
      } catch (cleanupError) {
        console.error(
          "User cleanup error:",
          cleanupError
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Erreur serveur.",
      },
      { status: 500 }
    );
  }
}