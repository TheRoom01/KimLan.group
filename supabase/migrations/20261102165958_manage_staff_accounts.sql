-- Serialize role changes so two concurrent L1 requests cannot remove each
-- other's authority. Login identities and room ownership are not deleted.
create table admin_staff_private.account_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  target_id uuid not null,
  action text not null check (action in ('role','delete')),
  old_level integer not null,
  new_level integer,
  created_at timestamptz not null default now()
);
alter table admin_staff_private.account_events enable row level security;
revoke all on admin_staff_private.account_events from public, anon, authenticated;

create or replace function admin_staff_private.manage_account(
  p_user_id uuid, p_action text, p_level integer, p_expected_level integer
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_level integer;
  v_old_level integer;
begin
  lock table public.admin_users in share row exclusive mode;
  select level into v_actor_level from public.admin_users where user_id = v_actor;
  if v_actor is null or v_actor_level is distinct from 1 then
    raise exception 'STAFF_FORBIDDEN' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('delete','role')
    or p_expected_level is null or p_expected_level not in (1,2)
    or (p_action = 'role' and (p_level is null or p_level not in (1,2))) then
    raise exception 'STAFF_INVALID_INPUT';
  end if;
  select level into v_old_level from public.admin_users where user_id = p_user_id;
  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
  if v_old_level = 1 and (p_action = 'delete' or p_level <> 1)
    and (select count(*) from public.admin_users where level=1) <= 1 then
    raise exception 'STAFF_LAST_L1';
  end if;
  if p_user_id = v_actor then raise exception 'STAFF_SELF_CHANGE'; end if;
  if v_old_level is distinct from p_expected_level then raise exception 'STAFF_CONFLICT'; end if;
  if p_action = 'delete' then
    delete from public.admin_users where user_id = p_user_id;
  else
    update public.admin_users set level = p_level where user_id = p_user_id;
  end if;
  insert into admin_staff_private.account_events(actor_id,target_id,action,old_level,new_level)
  values (v_actor,p_user_id,p_action,v_old_level,case when p_action='role' then p_level else null end);
end;
$$;
revoke all on function admin_staff_private.manage_account(uuid,text,integer,integer) from public, anon;
grant execute on function admin_staff_private.manage_account(uuid,text,integer,integer) to authenticated;
create or replace function public.manage_staff_account(
  p_user_id uuid, p_action text, p_level integer, p_expected_level integer
) returns void language sql security invoker set search_path = ''
as $$ select admin_staff_private.manage_account(p_user_id,p_action,p_level,p_expected_level); $$;
revoke all on function public.manage_staff_account(uuid,text,integer,integer) from public, anon;
grant execute on function public.manage_staff_account(uuid,text,integer,integer) to authenticated;
