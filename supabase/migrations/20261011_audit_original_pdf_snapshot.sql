-- Snapshot the workspace and original PDF SHA-256 alongside each event.
CREATE OR REPLACE FUNCTION public.onosign_record_document_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.documents%rowtype;
begin
 if tg_table_name='documents' then
  if tg_op='INSERT' then
   insert into public.onosign_document_audit(document_id,event_type,actor_id,next_status,source_sha256,workspace_id,organization_id)
   values(new.id,'document_created',auth.uid(),new.status,new.original_sha256,new.workspace_id,new.organization_id);
  elsif old.status is distinct from new.status then
   insert into public.onosign_document_audit(document_id,event_type,actor_id,previous_status,next_status,source_sha256,workspace_id,organization_id)
   values(new.id,'document_status_changed',auth.uid(),old.status,new.status,new.original_sha256,new.workspace_id,new.organization_id);
  end if;
 elsif tg_table_name='recipients' then
  select * into d from public.documents where id=new.document_id;
  if tg_op='INSERT' then
   insert into public.onosign_document_audit(document_id,event_type,actor_id,recipient_id,next_status,source_sha256,workspace_id,organization_id)
   values(new.document_id,'recipient_added',auth.uid(),new.id,new.status,d.original_sha256,d.workspace_id,d.organization_id);
  elsif old.status is distinct from new.status then
   insert into public.onosign_document_audit(document_id,event_type,actor_id,recipient_id,previous_status,next_status,source_sha256,workspace_id,organization_id)
   values(new.document_id,'recipient_status_changed',auth.uid(),new.id,old.status,new.status,d.original_sha256,d.workspace_id,d.organization_id);
  end if;
 end if;
 return new;
end;
$function$;
revoke execute on function public.onosign_record_document_audit() from public,anon,authenticated;
