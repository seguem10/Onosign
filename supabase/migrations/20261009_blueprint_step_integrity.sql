-- Database invariants for all catalogue writers, including future APIs.
-- Existing rows are checked before the constraints are installed.
alter table public.signature_blueprint_steps
  add constraint onosign_required_step_must_sign
  check (not is_required or recipient_type = 'signer');

alter table public.signature_blueprint_steps
  add constraint onosign_requester_has_no_default_identity
  check (not is_requester or
    (nullif(btrim(default_name), '') is null
     and nullif(btrim(default_email), '') is null));

create or replace function public.onosign_validate_blueprint_step_condition()
returns trigger language plpgsql set search_path = '' as $$
declare v_document_type text;
begin
  select document_type into v_document_type
    from public.signature_blueprints where id = new.blueprint_id;
  if v_document_type is null then
    raise exception 'Unknown blueprint';
  end if;
  if new.condition_type = 'above_threshold' and v_document_type <> 'DI' then
    raise exception 'Financial condition is only valid for DI';
  end if;
  return new;
end;
$$;

drop trigger if exists onosign_validate_blueprint_step_condition_trigger
  on public.signature_blueprint_steps;
create trigger onosign_validate_blueprint_step_condition_trigger
before insert or update of blueprint_id, condition_type
on public.signature_blueprint_steps
for each row execute function public.onosign_validate_blueprint_step_condition();
