-- Confidential DI/DR signatures and legacy event metadata inherit document visibility.
-- Preserve the existing permissive policies for legacy non-DI/DR documents.
create policy onosign_private_financial_signatures
on public.signatures as restrictive for select to authenticated
using (
  exists (
    select 1 from public.documents d
    where d.id = signatures.document_id
      and (
        d.document_type is null
        or d.created_by = (select auth.uid())
        or public.is_workspace_admin(d.workspace_id)
        or exists (
          select 1 from public.organization_members m
          where m.organization_id = d.organization_id
            and m.user_id = (select auth.uid()) and m.role in ('owner','admin')
        )
      )
  )
);
create policy onosign_private_financial_events
on public.audit_events as restrictive for select to authenticated
using (
  exists (
    select 1 from public.documents d
    where d.id = audit_events.document_id
      and (
        d.document_type is null
        or d.created_by = (select auth.uid())
        or public.is_workspace_admin(d.workspace_id)
        or exists (
          select 1 from public.organization_members m
          where m.organization_id = d.organization_id
            and m.user_id = (select auth.uid()) and m.role in ('owner','admin')
        )
      )
  )
);