-- A legacy check only allowed amount_eur on DI documents.
-- DR payment requests must also carry their amount, including EUR 0.
-- Keep nonnegative validation; do not rewrite existing document rows.
alter table public.documents
drop constraint if exists onosign_amount_only_di;

-- Both new document types require a monetary amount.
alter table public.documents
add constraint onosign_di_dr_amount_required
check (document_type is null or amount_eur is not null) not valid;
alter table public.documents
validate constraint onosign_di_dr_amount_required;
