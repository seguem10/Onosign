import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Vérifier l'utilisateur connecté
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/");
  }

  // 2. Vérifier le rôle dans l'organisation
  const { data: membership, error: membershipError } =
    await supabase
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

  // 3. Autoriser uniquement owner et admin
  if (
    membershipError ||
    !membership ||
    !["owner", "admin"].includes(membership.role)
  ) {
    redirect("/dashboard");
  }

  // 4. Afficher l'administration
  return <>{children}</>;
}