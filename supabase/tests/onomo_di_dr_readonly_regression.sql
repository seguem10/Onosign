-- Read-only regression checks for ONOMO DI/DR templates.
-- Safe to run on the existing database: no document, recipient, user or model changes.
with amounts(amount_eur) as (
 values (0::numeric),(4999.99),(5000),(19999.99),(20000),(20000.01),(50000)
), rules as (
 select amount_eur,
 public.onosign_required_power_count('DI',amount_eur,20000) as di_power_signers,
 case when amount_eur > 20000 then 2 else 1 end as dr_directors,
 case when amount_eur >= 20000 then 2 else 1 end as expected_di,
 case when amount_eur > 20000 then 2 else 1 end as expected_dr
 from amounts
)
select amount_eur,di_power_signers,dr_directors,
 case when di_power_signers=expected_di and dr_directors=expected_dr then 'PASS' else 'FAIL' end as result
from rules order by amount_eur;

-- Verify that inactive seeded models have the expected conditional steps.
select b.document_type,b.name,b.is_active,
 count(*) filter(where s.is_requester) as requester_steps,
 count(*) filter(where s.condition_type='above_threshold' and s.authorization_role='power_of_attorney') as di_threshold_power_steps,
 count(*) filter(where s.condition_type='above_20k_strict' and s.role_label ilike 'Director / Directeur%') as dr_strict_director_steps
from public.signature_blueprints b
join public.signature_blueprint_steps s on s.blueprint_id=b.id
where b.organization_id='4c40b483-3353-4f4c-9291-550effbb9d43'
and b.name in ('DI - Circuit central ONOMO - Hôtels','DR - Payment Request Form - Tous montants')
group by b.id,b.document_type,b.name,b.is_active
order by b.document_type;