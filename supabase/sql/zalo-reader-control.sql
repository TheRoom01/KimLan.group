-- Apply once before deploying the Start/Stop UI. No Reader is started here.
create table if not exists public.zalo_reader_control (
  id text primary key check (id = 'primary'),
  desired_enabled boolean,
  request_id uuid,
  requested_at timestamptz,
  requested_by uuid,
  applied_request_id uuid,
  actual_enabled boolean,
  heartbeat_at timestamptz,
  last_error text
);
alter table public.zalo_reader_control enable row level security;
revoke all on public.zalo_reader_control from anon, authenticated;
grant select, update on public.zalo_reader_control to service_role;
insert into public.zalo_reader_control(id) values ('primary') on conflict do nothing;
