-- Fail closed for the new blueprint workflow until an atomic, audited dispatch
-- function is implemented. Legacy documents without a blueprint are unchanged.
create or replace function public.onosign_block_unvalidated_blueprint_dispatch()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'draft'
     and new.status is distinct from 'draft'
     and (old.signature_blueprint_id is not null or new.signature_blueprint_id is not null)
  then
    raise exception 'Catalogue workflow dispatch is disabled until server-side authorization is implemented';
  end if;
  return new;
end;
$$;

drop trigger if exists onosign_block_unvalidated_blueprint_dispatch_trigger on public.documents;
create trigger onosign_block_unvalidated_blueprint_dispatch_trigger
before update of status on public.documents
for each row execute function public.onosign_block_unvalidated_blueprint_dispatch();
