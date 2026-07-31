begin;

create table if not exists public.owner_registration_rate_limits (
  scope text not null check (scope in ('email', 'ip')),
  identifier_hash text not null,
  window_started_at timestamptz not null default now(),
  send_count integer not null default 0,
  failed_verify_count integer not null default 0,
  last_sent_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope, identifier_hash)
);

alter table public.owner_registration_rate_limits enable row level security;

create or replace function public.owner_registration_consume_send_v1(
  p_email_hash text,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_last_sent timestamptz;
  v_max_count integer;
  v_retry_after integer;
begin
  insert into public.owner_registration_rate_limits(scope, identifier_hash)
  values ('email', p_email_hash), ('ip', p_ip_hash)
  on conflict (scope, identifier_hash) do nothing;

  perform 1
  from public.owner_registration_rate_limits
  where (scope = 'email' and identifier_hash = p_email_hash)
     or (scope = 'ip' and identifier_hash = p_ip_hash)
  order by scope, identifier_hash
  for update;

  update public.owner_registration_rate_limits
  set window_started_at = v_now,
      send_count = 0,
      failed_verify_count = 0,
      last_sent_at = null,
      updated_at = v_now
  where ((scope = 'email' and identifier_hash = p_email_hash)
      or (scope = 'ip' and identifier_hash = p_ip_hash))
    and window_started_at <= v_now - interval '1 hour';

  select max(last_sent_at), max(send_count)
  into v_last_sent, v_max_count
  from public.owner_registration_rate_limits
  where (scope = 'email' and identifier_hash = p_email_hash)
     or (scope = 'ip' and identifier_hash = p_ip_hash);

  if v_last_sent is not null and v_last_sent > v_now - interval '60 seconds' then
    v_retry_after := greatest(1, ceil(extract(epoch from (v_last_sent + interval '60 seconds' - v_now)))::integer);
    return jsonb_build_object('allowed', false, 'reason', 'cooldown', 'retry_after', v_retry_after);
  end if;

  if coalesce(v_max_count, 0) >= 5 then
    select greatest(
      1,
      ceil(extract(epoch from (min(window_started_at) + interval '1 hour' - v_now)))::integer
    )
    into v_retry_after
    from public.owner_registration_rate_limits
    where (scope = 'email' and identifier_hash = p_email_hash)
       or (scope = 'ip' and identifier_hash = p_ip_hash);

    return jsonb_build_object('allowed', false, 'reason', 'hourly_limit', 'retry_after', v_retry_after);
  end if;

  update public.owner_registration_rate_limits
  set send_count = send_count + 1,
      last_sent_at = v_now,
      updated_at = v_now
  where (scope = 'email' and identifier_hash = p_email_hash)
     or (scope = 'ip' and identifier_hash = p_ip_hash);

  return jsonb_build_object('allowed', true, 'retry_after', 60);
end;
$function$;

create or replace function public.owner_registration_record_failure_v1(
  p_email_hash text,
  p_ip_hash text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_failures integer;
begin
  insert into public.owner_registration_rate_limits(scope, identifier_hash)
  values ('email', p_email_hash), ('ip', p_ip_hash)
  on conflict (scope, identifier_hash) do nothing;

  update public.owner_registration_rate_limits
  set failed_verify_count = failed_verify_count + 1,
      updated_at = clock_timestamp()
  where (scope = 'email' and identifier_hash = p_email_hash)
     or (scope = 'ip' and identifier_hash = p_ip_hash);

  select max(failed_verify_count) into v_failures
  from public.owner_registration_rate_limits
  where (scope = 'email' and identifier_hash = p_email_hash)
     or (scope = 'ip' and identifier_hash = p_ip_hash);

  return coalesce(v_failures, 0);
end;
$function$;

create or replace function public.owner_registration_captcha_required_v1(
  p_email_hash text,
  p_ip_hash text
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(max(failed_verify_count), 0) >= 3
  from public.owner_registration_rate_limits
  where (scope = 'email' and identifier_hash = p_email_hash)
     or (scope = 'ip' and identifier_hash = p_ip_hash);
$function$;

revoke all on table public.owner_registration_rate_limits from public, anon, authenticated;
revoke all on function public.owner_registration_consume_send_v1(text, text) from public, anon, authenticated;
revoke all on function public.owner_registration_record_failure_v1(text, text) from public, anon, authenticated;
revoke all on function public.owner_registration_captcha_required_v1(text, text) from public, anon, authenticated;
grant execute on function public.owner_registration_consume_send_v1(text, text) to service_role;
grant execute on function public.owner_registration_record_failure_v1(text, text) to service_role;
grant execute on function public.owner_registration_captcha_required_v1(text, text) to service_role;

commit;
