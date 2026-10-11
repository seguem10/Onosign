-- Protect the original document artifact and new DI/DR PDF signature placement.
-- Additive: no existing document or field data is rewritten.
create or replace function public.onosign_protect_original_artifact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.storage_path is distinct from old.storage_path or
    new.original_sha256 is distinct from old.original_sha256
  ) then
    raise exception 'Original PDF path and fingerprint are immutable';
  end if;

  if new.document_type in ('DI','DR') then
    if new.original_sha256 is null or new.original_sha256 !~ '^[a-f0-9]{64}$' then
      raise exception 'DI/DR documents require an original SHA-256 fingerprint';
    end if;
    if new.storage_path not like (new.workspace_id::text || '/' || new.created_by::text || '/%') then
      raise exception 'Original PDF must reside in the creator workspace directory';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists onosign_protect_original_artifact_trg on public.documents;
create trigger onosign_protect_original_artifact_trg
before insert or update on public.documents
for each row execute function public.onosign_protect_original_artifact();

alter table public.signature_fields
add constraint onosign_signature_field_normalized_coordinates
check (
  page_number >= 1 and
  x >= 0 and y >= 0 and
  width > 0 and height > 0 and
  x + width <= 1 and y + height <= 1
) not valid;
alter table public.signature_fields
validate constraint onosign_signature_field_normalized_coordinates;

-- Normalize signature field ownership for all documents; stricter creator-only
-- editing is applied specifically to the new DI/DR workflows.
create or replace function public.onosign_validate_signature_field_write()
returns trigger language plpgsql set search_path = '' as $$
declare
  d public.documents%rowtype;
  r public.recipients%rowtype;
  v_document_id uuid;
  v_recipient_id uuid;
begin
  v_document_id := case when tg_op = 'DELETE' then old.document_id else new.document_id end;
  v_recipient_id := case when tg_op = 'DELETE' then old.recipient_id else new.recipient_id end;
  select * into d from public.documents where id = v_document_id;
  if not found then raise exception 'Document unavailable'; end if;
  if d.document_type in ('DI','DR') then
    if d.status is distinct from 'draft' or d.created_by is distinct from auth.uid() then
      raise exception 'Only the creator may edit fields on a draft DI/DR document';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    select * into r from public.recipients where id = v_recipient_id;
    if not found or r.document_id is distinct from v_document_id or r.recipient_type <> 'signer' then
      raise exception 'Signature field recipient must be a signer on this document';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists onosign_validate_signature_field_write_trg on public.signature_fields;
create trigger onosign_validate_signature_field_write_trg
before insert or update or delete on public.signature_fields
for each row execute function public.onosign_validate_signature_field_write();
