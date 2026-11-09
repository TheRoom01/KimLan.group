-- Bind device admission to the Supabase Auth session, including after a
-- browser loses its device cookies. Existing devices are bound on first use.
alter table public.device_sessions add column auth_session_id uuid,
  add column replaced_at_login boolean not null default false;
create unique index device_sessions_auth_session_idx
  on public.device_sessions (auth_session_id) where auth_session_id is not null;

create function public.admit_device_session(
  p_device_id text,
  p_token_hash text,
  p_device_fingerprint text,
  p_device_name text,
  p_replace_session_id bigint default null
)
returns table(status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_auth_session uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
  v_device public.device_sessions%rowtype;
  v_active int;
begin
  if v_uid is null or v_auth_session is null then
    return query select 'unauthorized'::text;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text, 43190));

  select * into v_device from public.device_sessions
  where auth_session_id = v_auth_session and user_id = v_uid
  for update;
  if not found then
    select * into v_device from public.device_sessions
    where token_hash = p_token_hash and user_id = v_uid
      and (revoked_at is null or auth_session_id is null)
    for update;
  end if;

  if v_device.id is not null then
    if v_device.revoked_at is not null then
      return query select case when v_device.replaced_at_login then 'replaced' else 'revoked' end;
    else
      update public.device_sessions
      set auth_session_id = v_auth_session,
          last_seen_at = now(),
          device_name = coalesce(p_device_name, device_name)
      where id = v_device.id;
      return query select 'ok'::text;
    end if;
    return;
  end if;

  update public.device_sessions
  set revoked_at = now()
  where user_id = v_uid and revoked_at is null
    and last_seen_at < now() - interval '30 days';

  select count(*) into v_active from public.device_sessions
  where user_id = v_uid and revoked_at is null;

  if v_active >= 2 and p_replace_session_id is not null then
    update public.device_sessions
    set revoked_at = now(), replaced_at_login = true
    where id = p_replace_session_id and user_id = v_uid and revoked_at is null;
    if found then
      v_active := v_active - 1;
    end if;
  end if;

  if v_active >= 2 then
    return query select 'limit_reached'::text;
    return;
  end if;

  insert into public.device_sessions (
    user_id, auth_session_id, device_id, token_hash, device_fingerprint, device_name
  ) values (
    v_uid, v_auth_session, p_device_id, p_token_hash, p_device_fingerprint, p_device_name
  );
  return query select 'ok'::text;
end;
$function$;

revoke execute on function public.admit_device_session(text,text,text,text,bigint) from public, anon;
grant execute on function public.admit_device_session(text,text,text,text,bigint) to authenticated;

-- Preserve both existing RPC signatures while enforcing one server-side limit.
create or replace function public.register_device_session(
  p_device_id text, p_token_hash text, p_device_fingerprint text,
  p_max_devices integer default 2, p_evict_oldest boolean default true,
  p_device_name text default null
)
returns table(status text)
language sql
security definer
set search_path = ''
as $function$
  select * from public.admit_device_session(p_device_id, p_token_hash, p_device_fingerprint, p_device_name);
$function$;

create or replace function public.register_device_session(
  p_device_id text, p_token_hash text, p_max_devices integer default 2,
  p_evict_oldest boolean default true
)
returns table(status text)
language sql
security definer
set search_path = ''
as $function$
  select * from public.admit_device_session(p_device_id, p_token_hash, null, null);
$function$;

create or replace function public.validate_device_session(p_token_hash text)
returns table(valid boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_auth_session uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
begin
  if v_uid is null or v_auth_session is null then
    return query select false;
    return;
  end if;

  update public.device_sessions
  set last_seen_at = now()
  where auth_session_id = v_auth_session and user_id = v_uid and revoked_at is null;
  if found then
    return query select true;
    return;
  end if;

  -- Admission binds a legacy cookie under the same lock as registration.
  return query select false;
end;
$function$;

create or replace function public.revoke_device_session(p_token_hash text)
returns table(status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_auth_session uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
begin
  if v_uid is null or v_auth_session is null then
    return query select 'unauthorized'::text;
    return;
  end if;

  update public.device_sessions
  set revoked_at = now()
  where user_id = v_uid and revoked_at is null
    and (auth_session_id = v_auth_session or (auth_session_id is null and token_hash = p_token_hash));

  return query select case when found then 'ok' else 'not_found' end;
end;
$function$;

