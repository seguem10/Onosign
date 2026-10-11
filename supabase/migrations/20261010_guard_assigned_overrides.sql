create or replace function public.onosign_guard_assigned_override()
returns trigger language plpgsql set search_path = '' as $$
declare v_blueprint uuid; v_workspace uuid;
begin
 if tg_table_name = 'signature_blueprint_overrides' then
   if tg_op = 'DELETE' then v_blueprint := old.blueprint_id; v_workspace := old.workspace_id;
   else v_blueprint := new.blueprint_id; v_workspace := new.workspace_id; end if;
 else
   if tg_op = 'DELETE' then
     select o.blueprint_id,o.workspace_id into v_blueprint,v_workspace
     from public.signature_blueprint_overrides o where o.id = old.blueprint_override_id;
   else
     select o.blueprint_id,o.workspace_id into v_blueprint,v_workspace
     from public.signature_blueprint_overrides o where o.id = new.blueprint_override_id;
   end if;
 end if;
 if exists (select 1 from public.documents d where d.signature_blueprint_id=v_blueprint
    and d.workspace_id=v_workspace) then
   raise exception 'Cannot modify hotel signer overrides after workflow assignment';
 end if;
 if tg_op = 'DELETE' then return old; end if;
 return new;
end;
$$;
drop trigger if exists onosign_guard_assigned_override on public.signature_blueprint_overrides;
create trigger onosign_guard_assigned_override before insert or update or delete
on public.signature_blueprint_overrides for each row execute function public.onosign_guard_assigned_override();
drop trigger if exists onosign_guard_assigned_step_override on public.signature_blueprint_step_overrides;
create trigger onosign_guard_assigned_step_override before insert or update or delete
on public.signature_blueprint_step_overrides for each row execute function public.onosign_guard_assigned_override();
