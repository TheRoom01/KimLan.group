-- Reuse the authority table already consumed by all admin room RPCs.
alter table public.admin_users add column if not exists created_by uuid;
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon;
revoke insert, update, delete, truncate, references, trigger on public.admin_users from authenticated;
grant select on public.admin_users to authenticated;
grant all on public.admin_users to service_role;
create policy admin_staff_read on public.admin_users for select to authenticated
using (user_id = (select auth.uid()) or (select public.get_my_admin_level()) in (1,2));

create schema if not exists admin_staff_private;
revoke all on schema admin_staff_private from public, anon;
grant usage on schema admin_staff_private to authenticated;

create or replace function admin_staff_private.grant_account(
  p_email text, p_full_name text, p_phone text, p_level integer
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_level integer;
  v_user uuid;
  v_row public.admin_users;
begin
  select level into v_level from public.admin_users where user_id = v_actor for share;
  if v_actor is null or v_level is distinct from 1 then
    raise exception 'STAFF_FORBIDDEN' using errcode = '42501';
  end if;
  if p_level is null or p_level not in (1,2)
    or p_full_name is null or length(btrim(p_full_name)) not between 1 and 150
    or p_email is null or length(p_email) > 254
    or p_phone is null or p_phone !~ '^\+?[0-9 ()-]{8,25}$' then
    raise exception 'STAFF_INVALID_INPUT';
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then raise exception 'STAFF_USER_NOT_FOUND'; end if;
  insert into public.admin_users(user_id, level, email, full_name, phone, created_at, created_by)
  values (v_user, p_level, lower(btrim(p_email)), btrim(p_full_name), btrim(p_phone), now(), v_actor)
  on conflict (user_id) do nothing returning * into v_row;
  if not found then raise exception 'STAFF_ALREADY_ADMIN'; end if;
  return jsonb_build_object('user_id', v_row.user_id, 'email', v_row.email,
    'level', v_row.level, 'created_at', v_row.created_at);
end;
$$;
revoke all on function admin_staff_private.grant_account(text,text,text,integer) from public, anon;
grant execute on function admin_staff_private.grant_account(text,text,text,integer) to authenticated;

create or replace function public.grant_staff_account(
  p_email text, p_full_name text, p_phone text, p_level integer
) returns jsonb language sql security invoker set search_path = ''
as $$ select admin_staff_private.grant_account(p_email, p_full_name, p_phone, p_level); $$;
revoke all on function public.grant_staff_account(text,text,text,integer) from public, anon;
grant execute on function public.grant_staff_account(text,text,text,integer) to authenticated;
