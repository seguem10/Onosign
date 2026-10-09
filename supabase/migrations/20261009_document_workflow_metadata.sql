-- OnoSign: persist DI/DR type, monetary amount and selected catalogue blueprint.
-- Additive: existing documents remain legacy (document_type IS NULL).
-- This migration does not authorize dispatch; no blueprint is activated here.
alter table public.documents
  add column if not exists document_type text,
  add column if not exists amount_eur numeric(14,2),
  add column if not exists signature_blueprint_id uuid
    references public.signature_blueprints(id) on delete restrict;

alter table public.documents
  add constraint onosign_document_type_valid
    check (document_type is null or document_type in ('DI','DR')),
  add constraint onosign_amount_valid
    check (amount_eur is null or amount_eur >= 0),
  add constraint onosign_amount_only_di
    check (document_type = 'DI' or amount_eur is null);

create index if not exists onosign_documents_blueprint_idx
  on public.documents (signature_blueprint_id);

create or replace function public.onosign_validate_document_blueprint()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_org uuid;
  v_type text;
  v_scope text;
  v_active boolean;
  v_workspace_type text;
begin
  if tg_op = 'UPDATE' and old.status <> 'draft' and (
    new.document_type is distinct from old.document_type
    or new.amount_eur is distinct from old.amount_eur
    or new.signature_blueprint_id is distinct from old.signature_blueprint_id
  ) then
    raise exception 'Workflow configuration is immutable after draft';
  end if;

  if new.signature_blueprint_id is null then return new; end if;
  if new.document_type is null then
    raise exception 'Document type is required for catalogue models';
  end if;
  select organization_id, document_type, scope, is_active
    into v_org, v_type, v_scope, v_active
    from public.signature_blueprints where id = new.signature_blueprint_id;
  select type into v_workspace_type from public.workspaces where id = new.workspace_id;

  if v_org is null or v_org <> new.organization_id or v_type <> new.document_type then
    raise exception 'Document and catalogue model do not match';
  end if;
  if (v_workspace_type = 'hotel' and v_scope <> 'hotels')
    or (v_workspace_type <> 'hotel' and v_scope <> 'head_office') then
    raise exception 'Catalogue model is not available for this workspace';
  end if;
  -- Do not allow selecting a model that has not been reviewed/activated.
  if not v_active then
    raise exception 'Catalogue model is inactive';
  end if;
  return new;
end;
$$;

drop trigger if exists onosign_validate_document_blueprint_trigger on public.documents;
create trigger onosign_validate_document_blueprint_trigger
before insert or update of document_type, amount_eur, signature_blueprint_id,
  organization_id, workspace_id, status
on public.documents
for each row execute function public.onosign_validate_document_blueprint();
