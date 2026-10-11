create or replace function public.onosign_hotel_user_directory()
returns table(user_id uuid,full_name text)
language sql stable security definer set search_path='' as $$
select om.user_id,p.full_name from public.organization_members om
left join public.profiles p on p.id=om.user_id
where exists(select 1 from public.organization_members adm
 where adm.organization_id=om.organization_id
 and adm.user_id=auth.uid() and adm.role in ('owner','admin'))
order by p.full_name nulls last;
$$;
revoke all on function public.onosign_hotel_user_directory() from public;
grant execute on function public.onosign_hotel_user_directory() to authenticated;