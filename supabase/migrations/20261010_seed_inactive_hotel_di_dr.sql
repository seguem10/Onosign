-- Inactive ONOMO hotel DI / DR templates; no fictional signer identities.
do $seed$
declare
 v_org uuid := '4c40b483-3353-4f4c-9291-550effbb9d43';
 v_owner uuid := '2895fcaf-6877-4eac-91c0-ec3f678a80e5';
 v_di uuid;
 v_dr uuid;
begin
 if not exists(select 1 from public.organization_members where organization_id=v_org and user_id=v_owner and role='owner') then
  raise exception 'Organization owner not found';
 end if;
 insert into public.signature_blueprints(organization_id,name,document_type,scope,is_active,financial_threshold_eur,created_by)
 values(v_org,'DI - Circuit central ONOMO - Hôtels','DI','hotels',false,20000,v_owner)
 on conflict do nothing;
 select id into v_di from public.signature_blueprints where organization_id=v_org and name='DI - Circuit central ONOMO - Hôtels' and document_type='DI' and scope='hotels' and is_active=false;
 if v_di is null then raise exception 'DI blueprint conflict'; end if;
 if not exists(select 1 from public.signature_blueprint_steps where blueprint_id=v_di) then
  insert into public.signature_blueprint_steps(blueprint_id,step_order,role_label,recipient_type,is_requester,is_required,condition_type,authorization_role)
  values
   (v_di,1,'Demandeur','signer',true,true,'always','none'),
   (v_di,2,'Fondé de pouvoir 1','signer',false,true,'always','power_of_attorney'),
   (v_di,3,'Fondé de pouvoir 2','signer',false,true,'above_threshold','power_of_attorney');
 end if;
 insert into public.signature_blueprints(organization_id,name,document_type,scope,is_active,created_by)
 values(v_org,'DR - Payment Request Form - Tous montants','DR','hotels',false,v_owner)
 on conflict do nothing;
 select id into v_dr from public.signature_blueprints where organization_id=v_org and name='DR - Payment Request Form - Tous montants' and document_type='DR' and scope='hotels' and is_active=false;
 if v_dr is null then raise exception 'DR blueprint conflict'; end if;
 if not exists(select 1 from public.signature_blueprint_steps where blueprint_id=v_dr) then
  insert into public.signature_blueprint_steps(blueprint_id,step_order,role_label,recipient_type,is_requester,is_required,condition_type,authorization_role)
  values
   (v_dr,1,'Enquirer / Demandeur','signer',true,true,'always','none'),
   (v_dr,2,'Financial Department / RAF','signer',false,true,'always','none'),
   (v_dr,3,'Director / Directeur 1','signer',false,true,'always','none'),
   (v_dr,4,'Director / Directeur 2','signer',false,true,'above_20k_strict','none');
 end if;
end;
$seed$;