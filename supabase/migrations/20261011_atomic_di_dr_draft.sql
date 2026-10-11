-- Atomically insert a DI/DR draft and its verified requester.
create unique index if not exists onosign_document_original_path_unique on public.documents(storage_path);
CREATE OR REPLACE FUNCTION public.onosign_create_document_draft(p_organization_id uuid, p_workspace_id uuid, p_title text, p_storage_path text, p_document_type text, p_amount_eur numeric, p_original_sha256 text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_name text;
  v_document_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select u.email into v_email from auth.users u
  where u.id=v_user and u.email_confirmed_at is not null;
  if v_email is null or btrim(v_email)='' then
    raise exception 'Verified sender e-mail is required';
  end if;
  if not exists (
    select 1 from public.workspaces w
    join public.workspace_members wm on wm.workspace_id=w.id
    join public.organization_members om on om.organization_id=w.organization_id
    where w.id=p_workspace_id and w.organization_id=p_organization_id
      and w.is_active and wm.user_id=v_user and om.user_id=v_user
  ) then raise exception 'Workspace membership required'; end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 200 then
    raise exception 'Document title must be 1-200 characters';
  end if;
  if p_document_type is null or p_document_type not in ('DI','DR') then
    raise exception 'DI or DR document type is required';
  end if;
  if p_amount_eur is null or p_amount_eur<0
     or p_amount_eur>999999999999.99
     or p_amount_eur*100<>trunc(p_amount_eur*100) then
    raise exception 'Invalid EUR monetary amount';
  end if;
  if p_original_sha256 is null or p_original_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'SHA-256 of the uploaded original is required';
  end if;
  if p_storage_path is null
     or p_storage_path not like (p_workspace_id::text||'/'||v_user::text||'/%')
     or not exists (
       select 1 from storage.objects o
       where o.bucket_id='documents' and o.name=p_storage_path
         and o.owner_id=v_user::text
         and o.metadata->>'mimetype'='application/pdf'
     ) then raise exception 'PDF upload is not owned by this requester'; end if;
  select nullif(btrim(p.full_name),'') into v_name
  from public.profiles p where p.id=v_user;
  v_name := coalesce(v_name,v_email);

  insert into public.documents (
    organization_id,workspace_id,created_by,title,storage_path,status,
    document_type,amount_eur,original_sha256
  ) values (
    p_organization_id,p_workspace_id,v_user,btrim(p_title),p_storage_path,'draft',
    p_document_type,p_amount_eur,p_original_sha256
  ) returning id into v_document_id;

  insert into public.recipients (
    document_id,name,email,role_label,signing_order,status,recipient_type
  ) values (
    v_document_id,v_name,v_email,
    case when p_document_type='DR' then 'Enquirer / Demandeur' else 'Demandeur' end,
    1,'pending','signer'
  );
  return v_document_id;
end;
$function$;
revoke execute on function public.onosign_create_document_draft(uuid,uuid,text,text,text,numeric,text) from public,anon;
grant execute on function public.onosign_create_document_draft(uuid,uuid,text,text,text,numeric,text) to authenticated;
create policy onosign_di_dr_rpc_only_insert on public.documents as restrictive for insert to authenticated with check (document_type is null);
