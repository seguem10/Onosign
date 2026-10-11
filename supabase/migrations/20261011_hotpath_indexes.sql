-- Speed up dashboard and signature authorization lookups.
create index if not exists onosign_documents_creator_recent_idx on public.documents(created_by,created_at desc);
create index if not exists onosign_workspace_members_user_idx on public.workspace_members(user_id,workspace_id);
create index if not exists onosign_organization_members_user_idx on public.organization_members(user_id,organization_id);
create index if not exists onosign_signature_fields_recipient_idx on public.signature_fields(recipient_id);
create index if not exists onosign_links_step_idx on public.onosign_blueprint_recipient_links(blueprint_step_id);
create index if not exists onosign_notifications_recipient_idx on public.onosign_notifications(recipient_id);
create index if not exists onosign_workspaces_parent_idx on public.workspaces(parent_workspace_id) where parent_workspace_id is not null;