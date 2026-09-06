create table public.sales_portal_collections (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  link_ids uuid[] not null check (cardinality(link_ids) between 1 and 30 and array_position(link_ids, null) is null),
  public_token text not null unique,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  constraint sales_portal_collections_expiry check (expires_at is null or expires_at > created_at)
);
create index sales_portal_collections_creator_idx on public.sales_portal_collections(created_by, created_at desc);
alter table public.sales_portal_collections enable row level security;
revoke all on public.sales_portal_collections from anon, authenticated;
grant select on public.sales_portal_collections to authenticated;
grant all on public.sales_portal_collections to service_role;
create policy sales_portal_collections_select on public.sales_portal_collections
  for select to authenticated using (created_by = (select auth.uid()));
comment on table public.sales_portal_collections is 'Saved sales collections. Writes are performed by the server after authorizing every source link. Revocation does not modify source links.';
