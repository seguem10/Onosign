-- Restrict hotel membership changes to central administrators.
create or replace function public.onosign_assign_hotel_member(p_hotel uuid,p_member uuid,p_role text)
returns void language plpgsql security definer set search_path='' as $$
declare v_org uuid;
begin
 select organization_id into v_org from public.workspaces where id=p_hotel and type='hotel' and is_active;
 if v_org is null then raise exception 'Hotel not found'; end if;
 if p_role not in ('member','admin') then raise exception 'Unsupported role'; end if;
 if not exists(select 1 from public.organization_members where organization_id=v_org and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Administrator required'; end if;
 if not exists(select 1 from public.organization_members where organization_id=v_org and user_id=p_member) then raise exception 'Unknown organization member'; end if;
 insert into public.workspace_members(workspace_id,user_id,role) values(p_hotel,p_member,p_role)
 on conflict(workspace_id,user_id) do update set role=excluded.role;
end;
$$;
revoke all on function public.onosign_assign_hotel_member(uuid,uuid,text) from public;
grant execute on function public.onosign_assign_hotel_member(uuid,uuid,text) to authenticated;
