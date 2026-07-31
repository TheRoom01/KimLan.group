begin;

create table if not exists public.property_suggestion_dismissals (
  user_id uuid not null,
  property_id uuid not null references public.properties(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, property_id)
);

alter table public.property_suggestion_dismissals enable row level security;

drop policy if exists property_suggestion_dismissals_own on public.property_suggestion_dismissals;
create policy property_suggestion_dismissals_own on public.property_suggestion_dismissals
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on table public.property_suggestion_dismissals from public, anon;
grant select, insert, update, delete on table public.property_suggestion_dismissals to authenticated;
grant all on table public.property_suggestion_dismissals to service_role;

commit;
