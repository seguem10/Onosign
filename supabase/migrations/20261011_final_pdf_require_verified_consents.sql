-- A final PDF may be registered only after EVERY signer completed an
-- account-verified, immutable consent record. Fail closed on missing signers.
create or replace function public.onosign_final_artifact_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  d public.documents%rowtype;
  v_signers bigint;
  v_consents bigint;
  v_actors bigint;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Final PDF archival records cannot be modified or deleted';
  end if;

  select * into d from public.documents where id=new.document_id for share;
  if not found or d.status is distinct from 'completed'
    or d.signature_blueprint_id is null
    or d.document_type not in ('DI','DR')
    or new.workspace_id is distinct from d.workspace_id
    or new.organization_id is distinct from d.organization_id
    or d.final_sha256 is distinct from new.sha256
    or new.storage_path is distinct from
      (d.organization_id::text||'/'||d.workspace_id::text||'/'||d.id::text||'/final.pdf')
  then raise exception 'Final PDF requires a completed validated envelope'; end if;

  select count(*) into v_signers
  from public.recipients r
  where r.document_id=d.id and r.recipient_type='signer';

  select count(*), count(distinct c.actor_user_id)
    into v_consents,v_actors
  from public.onosign_signature_consents c
  join public.recipients r on r.id=c.recipient_id
  where c.document_id=d.id and r.document_id=d.id
    and r.recipient_type='signer'
    and c.original_sha256=d.original_sha256;

  if v_signers<2 or new.signature_count<>v_signers
    or v_consents<>v_signers or v_actors<>v_signers
    or exists(
      select 1 from public.recipients r where r.document_id=d.id
        and r.recipient_type='signer' and r.status<>'signed'
    )
  then raise exception 'Final PDF requires all distinct signers and verified consents'; end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id='onosign-final-pdfs' and o.name=new.storage_path
      and o.metadata->>'mimetype'='application/pdf'
  ) then raise exception 'Final PDF object unavailable in private archive'; end if;
  return new;
end;
$$;
revoke execute on function public.onosign_final_artifact_guard() from public,anon,authenticated;
