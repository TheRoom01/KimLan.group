-- Exercises real authorization and insertion in a transaction; leaves no account changes.
begin;
select set_config('test.staff_l1', (select user_id::text from public.admin_users where level=1 limit 1), true);
select set_config('test.staff_l2', (select user_id::text from public.admin_users where level=2 limit 1), true);
select set_config('test.staff_target', (select email from auth.users u where email is not null and not exists(select 1 from public.admin_users a where a.user_id=u.id) limit 1), true);
set local role authenticated;
do $$
declare v_result jsonb; v_before timestamptz := now();
begin
  perform set_config('request.jwt.claim.sub', current_setting('test.staff_l2'), true);
  if public.get_my_admin_level() <> 2 then raise exception 'L2 lookup failed'; end if;
  begin
    perform public.grant_staff_account(current_setting('test.staff_target'), 'Staff test', '0900000000', 1);
    raise exception 'L2 grant should fail';
  exception when insufficient_privilege then
    if sqlerrm <> 'STAFF_FORBIDDEN' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', current_setting('test.staff_l1'), true);
  if public.get_my_admin_level() <> 1 then raise exception 'L1 lookup failed'; end if;
  v_result := public.grant_staff_account(current_setting('test.staff_target'), 'Staff test', '0900000000', 2);
  if (v_result->>'level')::integer <> 2 or (v_result->>'created_at')::timestamptz <> v_before then
    raise exception 'Grant metadata incorrect';
  end if;
  if not exists(select 1 from public.admin_users where user_id = (v_result->>'user_id')::uuid and created_by = auth.uid()) then
    raise exception 'Creator audit missing';
  end if;
  begin
    perform public.grant_staff_account(current_setting('test.staff_target'), 'Staff test', '0900000000', 1);
    raise exception 'Duplicate grant should fail';
  exception when raise_exception then
    if sqlerrm <> 'STAFF_ALREADY_ADMIN' then raise; end if;
  end;
  begin
    perform public.grant_staff_account('missing-staff-test@example.invalid', 'Staff test', '0900000000', 3);
    raise exception 'Unsupported level should fail';
  exception when raise_exception then
    if sqlerrm <> 'STAFF_INVALID_INPUT' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.grant_staff_account(current_setting('test.staff_target'), 'Staff test', '0900000000', 1);
    raise exception 'Unauthenticated grant should fail';
  exception when insufficient_privilege then
    if sqlerrm <> 'STAFF_FORBIDDEN' then raise; end if;
  end;
end;
$$;
rollback;
select 'PASS: L1 grant, L2/no-session denial, duplicate protection, invalid level, server date, creator audit; all test changes rolled back' as result;
