CREATE OR REPLACE FUNCTION public.onosign_my_signature_tasks()
 RETURNS TABLE(document_id uuid, document_title text, document_type text, recipient_id uuid, role_label text, signing_order integer, recipient_status text, expires_at timestamp with time zone, eligible_to_sign boolean, signing_enabled boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select d.id,d.title,d.document_type,r.id,r.role_label,r.signing_order,r.status,d.expires_at,
  (r.status in ('sent','viewed') and (d.expires_at is null or d.expires_at>now())
   and not exists(select 1 from public.recipients x where x.document_id=d.id and x.recipient_type='signer' and x.signing_order<r.signing_order and x.status<>'signed')
   and not exists(select 1 from public.recipients x where x.document_id=d.id and x.recipient_type='signer' and x.status='declined')
  ) as eligible_to_sign,
  false as signing_enabled
 from auth.users u
 join public.recipients r on lower(trim(r.email))=lower(trim(u.email))
 join public.documents d on d.id=r.document_id
 where u.id=auth.uid() and u.email_confirmed_at is not null
  and r.recipient_type='signer'
  and d.document_type in ('DI','DR')
  and d.signature_blueprint_id is not null
  and d.status in ('sent','viewed','partially_signed')
  and (select count(*) from public.recipients x where x.document_id=d.id and x.recipient_type='signer' and lower(trim(x.email))=lower(trim(u.email)))=1
 order by d.created_at desc,r.signing_order limit 100
$function$;
revoke execute on function public.onosign_my_signature_tasks() from public,anon;
grant execute on function public.onosign_my_signature_tasks() to authenticated;
