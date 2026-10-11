-- A future privileged sender can only queue an active DI/DR signer in sequence.
create or replace function public.onosign_validate_delivery_item()
returns trigger language plpgsql set search_path='' as $$
declare d public.documents%rowtype; r public.recipients%rowtype;
begin
  select * into d from public.documents where id=new.document_id;
  select * into r from public.recipients where id=new.recipient_id;
  if d.id is null or r.id is null or r.document_id<>d.id
     or d.document_type not in ('DI','DR')
     or d.signature_blueprint_id is null
     or d.status not in ('sent','viewed','partially_signed')
     or (d.expires_at is not null and d.expires_at<=now())
     or r.recipient_type<>'signer'
     or r.status not in ('sent','viewed')
     or not exists(select 1 from public.signature_fields f
        where f.document_id=d.id and f.recipient_id=r.id and f.field_type='signature')
     or exists(select 1 from public.recipients previous
        where previous.document_id=d.id and previous.recipient_type='signer'
          and previous.signing_order<r.signing_order and previous.status<>'signed')
  then raise exception 'Invalid signature delivery queue item'; end if;
  return new;
end;
$$;
revoke execute on function public.onosign_validate_delivery_item() from public,anon,authenticated;
create trigger onosign_validate_delivery_item_trg
before insert on public.onosign_delivery_outbox
for each row execute function public.onosign_validate_delivery_item();