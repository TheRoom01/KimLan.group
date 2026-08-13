alter table public.sales_property_documents
  rename to property_documents;

alter index if exists public.sales_property_documents_property_sort_idx
  rename to property_documents_property_sort_idx;

alter table public.property_documents
  rename constraint sales_property_documents_title_length to property_documents_title_length;

create table public.sales_portal_link_documents (
  link_id uuid not null references public.sales_portal_links(id) on delete cascade,
  document_id uuid not null references public.property_documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (link_id, document_id)
);

create index sales_portal_link_documents_document_idx
  on public.sales_portal_link_documents(document_id);

-- Preserve the old behaviour: every existing link initially shares every
-- existing document that belongs to the same property.
insert into public.sales_portal_link_documents (link_id, document_id)
select links.id, documents.id
from public.sales_portal_links links
join public.property_documents documents
  on documents.property_id = links.property_id
on conflict do nothing;

alter table public.sales_portal_link_documents enable row level security;

drop policy if exists sales_property_documents_manage on public.property_documents;
create policy property_documents_manage
  on public.property_documents
  for all
  to authenticated
  using (public.can_manage_property(property_id))
  with check (
    public.can_manage_property(property_id)
    and created_by = (select auth.uid())
  );

create policy sales_portal_link_documents_manage
  on public.sales_portal_link_documents
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.sales_portal_links links
      join public.property_documents documents
        on documents.id = sales_portal_link_documents.document_id
       and documents.property_id = links.property_id
      where links.id = sales_portal_link_documents.link_id
        and public.can_manage_property(links.property_id)
    )
  )
  with check (
    exists (
      select 1
      from public.sales_portal_links links
      join public.property_documents documents
        on documents.id = sales_portal_link_documents.document_id
       and documents.property_id = links.property_id
      where links.id = sales_portal_link_documents.link_id
        and public.can_manage_property(links.property_id)
    )
  );

revoke all on table public.property_documents from anon;
revoke all on table public.sales_portal_link_documents from anon;
grant select, insert, update, delete on table public.property_documents to authenticated;
grant select, insert, update, delete on table public.sales_portal_link_documents to authenticated;
grant all on table public.property_documents to service_role;
grant all on table public.sales_portal_link_documents to service_role;

comment on table public.property_documents is
  'Owner-managed property document library. Documents are shared explicitly through Sales Portal links.';
comment on table public.sales_portal_link_documents is
  'Documents selected for one specific Sales Portal link.';
