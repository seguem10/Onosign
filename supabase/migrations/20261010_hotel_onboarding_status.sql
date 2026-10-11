-- Read-only hotel onboarding overview, restricted to organization owners/admins.
create or replace function public.onosign_hotel_onboarding_status()
returns table (
  workspace_id uuid,
  hotel_name text,
  country_code text,
  member_count bigint,
  has_members boolean
)
language sql stable security definer set search_path = ''
as $$
  select w.id, w.name, w.country_code,
         count(m.user_id)::bigint,
         count(m.user_id) > 0
  from public.workspaces w
  left join public.workspace_members m on m.workspace_id = w.id
  where w.type = 'hotel'
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = w.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner','admin')
    )
  group by w.id,w.name,w.country_code
  order by w.name;
$$;
revoke all on function public.onosign_hotel_onboarding_status() from public;
grant execute on function public.onosign_hotel_onboarding_status() to authenticated;
