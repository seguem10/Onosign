-- Preserve audit entries by preventing cascading deletions of referenced documents.
alter table public.onosign_document_audit drop constraint if exists onosign_document_audit_document_id_fkey;
alter table public.onosign_document_audit add constraint onosign_document_audit_document_id_fkey foreign key (document_id) references public.documents(id) on delete restrict;