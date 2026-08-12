create table if not exists public.sales_portal_links (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  token_hash text not null unique,
  label text not null default 'Sales Portal',
  created_by uuid not null references auth.users(id),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_portal_links_label_length check (char_length(label) between 1 and 120),
  constraint sales_portal_links_expiry check (expires_at is null or expires_at > created_at)
);

create index if not exists sales_portal_links_property_active_idx
  on public.sales_portal_links(property_id, created_at desc)
  where revoked_at is null;

create table if not exists public.sales_property_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  title text not null,
  description text,
  file_name text not null,
  file_url text not null,
  file_path text,
  mime_type text,
  size_bytes bigint,
  sort_order integer not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_property_documents_title_length check (char_length(title) between 1 and 200),
  constraint sales_property_documents_size check (size_bytes is null or size_bytes between 0 and 20971520)
);

create index if not exists sales_property_documents_property_sort_idx
  on public.sales_property_documents(property_id, sort_order, created_at desc);

create table if not exists public.sales_room_notes (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  note text not null,
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_room_notes_note_length check (char_length(note) between 1 and 5000)
);

create index if not exists sales_room_notes_property_idx
  on public.sales_room_notes(property_id);

alter table public.sales_portal_links enable row level security;
alter table public.sales_property_documents enable row level security;
alter table public.sales_room_notes enable row level security;

drop policy if exists sales_portal_links_select on public.sales_portal_links;
create policy sales_portal_links_select on public.sales_portal_links for select to authenticated
  using (public.can_manage_property(property_id));
drop policy if exists sales_portal_links_insert on public.sales_portal_links;
create policy sales_portal_links_insert on public.sales_portal_links for insert to authenticated
  with check (public.can_manage_property(property_id) and created_by = (select auth.uid()));
drop policy if exists sales_portal_links_update on public.sales_portal_links;
create policy sales_portal_links_update on public.sales_portal_links for update to authenticated
  using (public.can_manage_property(property_id))
  with check (public.can_manage_property(property_id));
drop policy if exists sales_portal_links_delete on public.sales_portal_links;
create policy sales_portal_links_delete on public.sales_portal_links for delete to authenticated
  using (public.can_manage_property(property_id));

drop policy if exists sales_property_documents_manage on public.sales_property_documents;
create policy sales_property_documents_manage
  on public.sales_property_documents
  for all
  to authenticated
  using (public.can_manage_property(property_id))
  with check (public.can_manage_property(property_id) and created_by = (select auth.uid()));

drop policy if exists sales_room_notes_manage on public.sales_room_notes;
create policy sales_room_notes_manage
  on public.sales_room_notes
  for all
  to authenticated
  using (public.can_manage_property(property_id))
  with check (
    public.can_manage_property(property_id)
    and updated_by = (select auth.uid())
    and exists (
      select 1 from public.rooms r
      where r.id = room_id and r.property_id = property_id
    )
  );

revoke all on table public.sales_portal_links from anon;
revoke all on table public.sales_property_documents from anon;
revoke all on table public.sales_room_notes from anon;

grant select, insert, update, delete on table public.sales_portal_links to authenticated;
grant select, insert, update, delete on table public.sales_property_documents to authenticated;
grant select, insert, update, delete on table public.sales_room_notes to authenticated;
grant all on table public.sales_portal_links to service_role;
grant all on table public.sales_property_documents to service_role;
grant all on table public.sales_room_notes to service_role;

comment on table public.sales_portal_links is 'Hashed, revocable links that expose one property through the server-only Sales Portal API.';
comment on table public.sales_property_documents is 'Owner-managed documents visible only through a valid Sales Portal link.';
comment on table public.sales_room_notes is 'Internal sales notes for rooms, separate from public listing descriptions.';
