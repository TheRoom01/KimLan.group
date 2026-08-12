alter table public.sales_property_documents
  drop constraint if exists sales_property_documents_size;

comment on column public.sales_property_documents.size_bytes is
  'Original document size in bytes. Upload limits are governed by the storage provider rather than an application-level cap.';
