-- Close six legacy public SECURITY DEFINER RPC exposures found by Supabase advisor.
-- Existing authenticated onboarding and workspace RLS helper calls remain supported.
revoke execute on function public.can_admin_profile(uuid) from public, anon;
revoke execute on function public.create_organization(text,text,text) from public, anon;
revoke execute on function public.is_organization_owner(uuid) from public, anon;
revoke execute on function public.is_workspace_admin(uuid) from public, anon;
revoke execute on function public.is_workspace_member(uuid) from public, anon;
-- Auth user creation invokes this internally as a trigger, never as public RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
