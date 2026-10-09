-- OnoSign — READ-ONLY schema preflight.
-- Run ONLY in the Supabase project that actually hosts OnoSign.
-- This script does not create or modify any database objects.
-- Share the results without any user emails, tokens or other personal data.

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'organizations', 'organization_members', 'workspaces',
    'workflow_templates', 'workflow_steps', 'documents', 'recipients'
  )
order by table_name, ordinal_position;

select c.conrelid::regclass::text as table_name,
       c.conname as constraint_name,
       pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid in (
  'public.organization_members'::regclass,
  'public.workspaces'::regclass
)
order by 1, 2;

select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('organization_members', 'workspaces', 'workflow_templates', 'workflow_steps')
order by tablename, policyname;

select to_regclass('public.signature_blueprints') as blueprints,
       to_regclass('public.signature_blueprint_steps') as blueprint_steps,
       to_regclass('public.signature_blueprint_overrides') as overrides,
       to_regclass('public.signature_blueprint_step_overrides') as step_overrides;
