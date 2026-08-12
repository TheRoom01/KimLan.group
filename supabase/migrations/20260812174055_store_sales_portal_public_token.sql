alter table public.sales_portal_links
  add column if not exists public_token text;

create unique index if not exists sales_portal_links_public_token_idx
  on public.sales_portal_links(public_token)
  where public_token is not null;

comment on column public.sales_portal_links.public_token is
  'Shareable Sales Portal token retained so authorized property managers can copy the public URL again.';
