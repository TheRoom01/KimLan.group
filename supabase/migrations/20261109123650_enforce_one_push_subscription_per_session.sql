-- A changed browser subscription supersedes the old endpoint for this
-- signed-in device and origin, even if two tabs sync concurrently.
create unique index web_push_subscriptions_session_origin_idx
  on public.web_push_subscriptions (session_id, app_origin);
drop index public.web_push_subscriptions_session_idx;

create function public.sync_web_push_subscription(
  p_endpoint text, p_user_id uuid, p_session_id uuid, p_app_origin text,
  p_vapid_key text, p_p256dh text, p_auth_secret text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text, 78591));
  delete from public.web_push_subscriptions
  where session_id = p_session_id and app_origin = p_app_origin and endpoint <> p_endpoint;

  insert into public.web_push_subscriptions (
    endpoint, user_id, session_id, app_origin, vapid_key, p256dh, auth_secret
  ) values (
    p_endpoint, p_user_id, p_session_id, p_app_origin, p_vapid_key, p_p256dh, p_auth_secret
  )
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    session_id = excluded.session_id,
    app_origin = excluded.app_origin,
    vapid_key = excluded.vapid_key,
    p256dh = excluded.p256dh,
    auth_secret = excluded.auth_secret;
end;
$$;

revoke all on function public.sync_web_push_subscription(text,uuid,uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.sync_web_push_subscription(text,uuid,uuid,text,text,text,text) to service_role;
