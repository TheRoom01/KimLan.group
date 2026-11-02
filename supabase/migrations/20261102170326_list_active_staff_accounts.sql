create or replace function admin_staff_private.list_accounts()
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not exists(select 1 from public.admin_users where user_id=auth.uid() and level=1) then
    raise exception 'STAFF_FORBIDDEN' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',a.user_id,'full_name',a.full_name,'email',u.email,
    'phone',a.phone,'level',a.level,'created_at',a.created_at
  ) order by a.created_at desc nulls last,a.user_id), '[]'::jsonb)
  from public.admin_users a join auth.users u on u.id=a.user_id
  where a.level in (1,2) and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now()));
end;
$$;
revoke all on function admin_staff_private.list_accounts() from public, anon;
grant execute on function admin_staff_private.list_accounts() to authenticated;
create or replace function public.list_staff_accounts()
returns jsonb language sql security invoker set search_path = ''
as $$ select admin_staff_private.list_accounts(); $$;
revoke all on function public.list_staff_accounts() from public, anon;
grant execute on function public.list_staff_accounts() to authenticated;
