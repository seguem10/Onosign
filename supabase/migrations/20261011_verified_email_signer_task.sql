-- Identity-scoped, read-only signer task lookup for the future signing portal.
-- A verified Supabase Auth e-mail must match the intended recipient.
-- No PDF content, storage path or other recipient e-mails are returned.
-- Current DI/DR documents remain drafts, so no tasks are exposed yet.
create or replace function public.onosign_signer_task(p_document_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_email text;
  v_verified timestamptz;
  d public.documents%rowtype;
  r public.recipients%rowtype;
  v_can_sign boolean;
begin
  if auth.uid() is null then raise exception 'Signer task unavailable'; end if;
  select u.email,u.email_confirmed_at into v_email,v_verified
    from auth.users u where u.id=auth.uid();
  if v_email is null or v_verified is null then
    raise exception 'Signer task unavailable';
  end if;
  select * into d from public.documents
    where id=p_document_id and document_type in ('DI','DR')
      and status in ('sent','viewed','partially_signed');
  if not found then raise exception 'Signer task unavailable'; end if;
  select * into r from public.recipients
    where document_id=d.id and recipient_type='signer'
      and lower(btrim(email))=lower(btrim(v_email));
  if not found then raise exception 'Signer task unavailable'; end if;
  if (select count(*) from public.recipients
      where document_id=d.id and recipient_type='signer'
        and lower(btrim(email))=lower(btrim(v_email))) <> 1 then
    raise exception 'Signer task unavailable';
  end if;

  v_can_sign := r.status in ('sent','viewed')
    and (d.expires_at is null or d.expires_at > now())
    and not exists (select 1 from public.recipients prev
      where prev.document_id=d.id and prev.recipient_type='signer'
        and prev.signing_order<r.signing_order and prev.status<>'signed')
    and not exists (select 1 from public.recipients stop
      where stop.document_id=d.id and stop.recipient_type='signer'
        and stop.status='declined');

  return jsonb_build_object(
    'document_id',d.id,'title',d.title,'document_type',d.document_type,
    'document_status',d.status,'expires_at',d.expires_at,
    'recipient_id',r.id,'recipient_name',r.name,'role_label',r.role_label,
    'signing_order',r.signing_order,'recipient_status',r.status,
    'eligible_to_sign',v_can_sign,
    'signing_enabled',false
  );
end;
$$;
revoke all on function public.onosign_signer_task(uuid) from public,anon;
grant execute on function public.onosign_signer_task(uuid) to authenticated;
