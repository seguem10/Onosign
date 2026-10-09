-- Financial authorization roles are trusted catalogue metadata, not display labels.
alter table public.signature_blueprint_steps
  add column if not exists authorization_role text not null default 'none';
alter table public.signature_blueprint_steps
  drop constraint if exists onosign_authorization_role_valid;
alter table public.signature_blueprint_steps
  add constraint onosign_authorization_role_valid
  check (authorization_role in ('none','power_of_attorney'));
alter table public.signature_blueprint_steps
  drop constraint if exists onosign_power_must_sign;
alter table public.signature_blueprint_steps
  add constraint onosign_power_must_sign
  check (authorization_role <> 'power_of_attorney'
         or (recipient_type = 'signer' and is_required = true and is_requester = false));

-- Reject DI activation without a signer for amounts below the threshold and
-- two distinct signer slots at or above it. A conditional slot cannot cover
-- the below-threshold requirement.
create or replace function public.onosign_validate_blueprint_activation()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_always integer;
  v_above integer;
begin
  if new.is_active is true then
    if not exists (
      select 1 from public.signature_blueprint_steps s
      where s.blueprint_id = new.id and s.is_requester
        and s.is_required and s.step_order = 1 and s.recipient_type = 'signer'
    ) then raise exception 'First requester signature is mandatory'; end if;
    if new.document_type = 'DI' then
      select count(*) filter(where condition_type = 'always'),
             count(*) filter(where condition_type = 'above_threshold')
      into v_always,v_above
      from public.signature_blueprint_steps
      where blueprint_id = new.id and authorization_role = 'power_of_attorney';
      if v_always < 1 or v_always + v_above < 2 then
        raise exception 'DI requires one permanent and two total power-of-attorney signer slots';
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists onosign_validate_blueprint_activation_trigger on public.signature_blueprints;
create trigger onosign_validate_blueprint_activation_trigger
before insert or update of is_active on public.signature_blueprints
for each row execute function public.onosign_validate_blueprint_activation();

-- Catalogue workflows cannot leave draft by any direct status transition,
-- including an inserted document already marked sent. No exception for
-- service_role: a dedicated validated dispatch function must be built first.
create or replace function public.onosign_block_unvalidated_blueprint_dispatch()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.signature_blueprint_id is not null and new.status is distinct from 'draft'
  then raise exception 'Catalogue dispatch disabled pending verified authorization'; end if;
  if tg_op = 'UPDATE' and old.signature_blueprint_id is not null
    and new.status is distinct from 'draft'
  then raise exception 'Catalogue dispatch disabled pending verified authorization'; end if;
  return new;
end;
$$;
drop trigger if exists onosign_block_unvalidated_blueprint_dispatch_trigger on public.documents;
create trigger onosign_block_unvalidated_blueprint_dispatch_trigger
before insert or update on public.documents
for each row execute function public.onosign_block_unvalidated_blueprint_dispatch();
