-- Keep approved workflow steps immutable, including INSERT.
create or replace function public.onosign_guard_new_approved_step()
returns trigger language plpgsql set search_path = '' as $$
begin
 if exists (
   select 1 from public.signature_blueprints b
   where b.id = new.blueprint_id and b.is_active
 ) or exists (
   select 1 from public.documents d
   where d.signature_blueprint_id = new.blueprint_id
 ) then
   raise exception 'Cannot add a step to an active or assigned blueprint';
 end if;
 return new;
end;
$$;
drop trigger if exists onosign_guard_new_approved_step on public.signature_blueprint_steps;
create trigger onosign_guard_new_approved_step
before insert on public.signature_blueprint_steps
for each row execute function public.onosign_guard_new_approved_step();

-- Prevent moving an override from one assigned route to another.
create or replace function public.onosign_guard_override_move()
returns trigger language plpgsql set search_path = '' as $$
begin
 if tg_table_name = 'signature_blueprint_overrides' then
   if exists (
     select 1 from public.documents d
     where d.signature_blueprint_id = old.blueprint_id
       and d.workspace_id = old.workspace_id
   ) then raise exception 'Original hotel workflow is already assigned'; end if;
 else
   if exists (
     select 1 from public.signature_blueprint_overrides o
     join public.documents d on d.signature_blueprint_id = o.blueprint_id
       and d.workspace_id = o.workspace_id
     where o.id = old.blueprint_override_id
   ) then raise exception 'Original hotel signer override is already assigned'; end if;
 end if;
 return new;
end;
$$;
drop trigger if exists onosign_guard_override_move on public.signature_blueprint_overrides;
create trigger onosign_guard_override_move before update
on public.signature_blueprint_overrides
for each row execute function public.onosign_guard_override_move();
drop trigger if exists onosign_guard_step_override_move on public.signature_blueprint_step_overrides;
create trigger onosign_guard_step_override_move before update
on public.signature_blueprint_step_overrides
for each row execute function public.onosign_guard_override_move();
