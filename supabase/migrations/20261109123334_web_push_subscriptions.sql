create table public.web_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references auth.sessions(id) on delete cascade,
  app_origin text not null,
  vapid_key text not null,
  p256dh text not null,
  auth_secret text not null,
  last_test_at timestamptz
);

create index web_push_subscriptions_recipient_idx
  on public.web_push_subscriptions (user_id, app_origin, vapid_key);
create index web_push_subscriptions_session_idx on public.web_push_subscriptions (session_id);

alter table public.web_push_subscriptions enable row level security;
revoke all on public.web_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.web_push_subscriptions to service_role;

-- Keep subscriptions tied to the authenticated session. Devices removed by
-- the app's two-device limit stop receiving before they revisit the site.
create view public.web_push_active_subscriptions
with (security_invoker = true) as
select p.*
from public.web_push_subscriptions p
where exists (
  select 1 from public.device_sessions d
  where d.auth_session_id = p.session_id and d.user_id = p.user_id and d.revoked_at is null
);
revoke all on public.web_push_active_subscriptions from public, anon, authenticated;
grant select on public.web_push_active_subscriptions to service_role;
