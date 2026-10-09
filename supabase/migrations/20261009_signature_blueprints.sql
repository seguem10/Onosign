-- OnoSign workflow catalogue v1
-- Additive migration: does not modify existing workflow_templates/workflow_steps.
-- Apply manually in Supabase SQL Editor after reviewing and backing up the database.

create table if not exists public.signature_blueprints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null check (length(trim(name)) between 2 and 160),
  document_type text not null check (document_type in ('DI','DR')),
  scope text not null check (scope in ('hotels','head_office')),
  is_active boolean not null default false,
  financial_threshold_eur numeric(14,2) check (financial_threshold_eur > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint di_financial_threshold check (
    (document_type = 'DI' and financial_threshold_eur is not null)
    or (document_type = 'DR' and financial_threshold_eur is null)
  )
);

create table if not exists public.signature_blueprint_steps (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null references public.signature_blueprints(id) on delete cascade,
  step_order integer not null check (step_order > 0),
  role_label text not null check (length(trim(role_label)) > 0),
  default_name text,
  default_email text,
  recipient_type text not null check (recipient_type in ('signer','cc')),
  is_requester boolean not null default false,
  is_required boolean not null default false,
  condition_type text not null default 'always'
    check (condition_type in ('always','it','above_threshold')),
  created_at timestamptz not null default now(),
  unique (blueprint_id, step_order),
  constraint requester_must_sign check (
    not is_requester or (recipient_type = 'signer' and is_required and condition_type = 'always')
  )
);
create unique index if not exists signature_blueprint_one_requester
  on public.signature_blueprint_steps (blueprint_id) where is_requester;

create table if not exists public.signature_blueprint_overrides (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null references public.signature_blueprints(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (blueprint_id, workspace_id)
);

create table if not exists public.signature_blueprint_step_overrides (
  id uuid primary key default gen_random_uuid(),
  blueprint_override_id uuid not null references public.signature_blueprint_overrides(id) on delete cascade,
  step_id uuid not null references public.signature_blueprint_steps(id) on delete cascade,
  default_name text,
  default_email text,
  is_enabled boolean not null default true,
  unique (blueprint_override_id, step_id)
);

create index if not exists signature_blueprints_org_scope_idx
  on public.signature_blueprints (organization_id, scope, document_type);
create index if not exists signature_blueprint_overrides_workspace_idx
  on public.signature_blueprint_overrides (workspace_id);

-- Database-level financial rules for subsequent server-side enforcement.
-- Do not use client-supplied recipient counts as the source of truth.
create or replace function public.onosign_required_power_count(
  p_document_type text,
  p_amount_eur numeric,
  p_threshold_eur numeric
) returns integer
language plpgsql immutable
set search_path = ''
as $$
begin
  if p_document_type <> 'DI' then return 0; end if;
  if p_amount_eur is null or p_amount_eur < 0 then
    raise exception 'DI amount in EUR is required and must be nonnegative';
  end if;
  if p_threshold_eur is null or p_threshold_eur <= 0 then
    raise exception 'A positive DI approval threshold is required';
  end if;
  if p_amount_eur >= p_threshold_eur then return 2; end if;
  return 1;
end;
$$;

-- Deny-by-default: catalogue is writable only by organization owner/admin.
-- Explicitly qualify organization scope in every policy.
create or replace function public.onosign_is_catalogue_admin(p_organization_id uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  );
$$;

revoke all on function public.onosign_is_catalogue_admin(uuid) from public;
grant execute on function public.onosign_is_catalogue_admin(uuid) to authenticated;
revoke all on function public.onosign_required_power_count(text,numeric,numeric) from public;
grant execute on function public.onosign_required_power_count(text,numeric,numeric) to authenticated;

alter table public.signature_blueprints enable row level security;
alter table public.signature_blueprint_steps enable row level security;
alter table public.signature_blueprint_overrides enable row level security;
alter table public.signature_blueprint_step_overrides enable row level security;

create policy "catalogue_admin_blueprints" on public.signature_blueprints
  for all to authenticated
  using (public.onosign_is_catalogue_admin(organization_id))
  with check (public.onosign_is_catalogue_admin(organization_id)
    and created_by = (select auth.uid()));

create policy "catalogue_admin_steps" on public.signature_blueprint_steps
  for all to authenticated
  using (exists (
    select 1 from public.signature_blueprints b
    where b.id = blueprint_id
      and public.onosign_is_catalogue_admin(b.organization_id)
  ))
  with check (exists (
    select 1 from public.signature_blueprints b
    where b.id = blueprint_id
      and public.onosign_is_catalogue_admin(b.organization_id)
  ));

create policy "catalogue_admin_overrides" on public.signature_blueprint_overrides
  for all to authenticated
  using (exists (
    select 1 from public.signature_blueprints b
    where b.id = blueprint_id
      and public.onosign_is_catalogue_admin(b.organization_id)
  ))
  with check (exists (
    select 1 from public.signature_blueprints b
    join public.workspaces w on w.id = workspace_id
    where b.id = blueprint_id
      and w.organization_id = b.organization_id
      and public.onosign_is_catalogue_admin(b.organization_id)
  ));

create policy "catalogue_admin_step_overrides" on public.signature_blueprint_step_overrides
  for all to authenticated
  using (exists (
    select 1 from public.signature_blueprint_overrides o
    join public.signature_blueprints b on b.id = o.blueprint_id
    where o.id = blueprint_override_id
      and public.onosign_is_catalogue_admin(b.organization_id)
  ))
  with check (exists (
    select 1 from public.signature_blueprint_overrides o
    join public.signature_blueprints b on b.id = o.blueprint_id
    join public.signature_blueprint_steps s on s.id = step_id
    where o.id = blueprint_override_id
      and s.blueprint_id = b.id
      and public.onosign_is_catalogue_admin(b.organization_id)
  ));

-- Important: before enabling sending, implement a SECURITY DEFINER RPC or
-- server transaction that snapshots recipients, locks document status, checks
-- amounts, power-of-attorney identities and the complete approval chain.
-- This schema alone does NOT enforce the financial rule during document sending.
