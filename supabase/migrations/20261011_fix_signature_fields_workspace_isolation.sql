-- Prevent cross-hotel signature field exposure to regular organization members.
-- The existing users_can_view_signature_fields and workspace_members_can_view_signature_fields
-- policies already authorize actual workspace members.
drop policy if exists signature_fields_select_member on public.signature_fields;
