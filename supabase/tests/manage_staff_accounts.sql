begin;
select set_config('test.actor', (select a.user_id::text from public.admin_users a join auth.users u on u.id=a.user_id where a.level=1 limit 1), true);
select set_config('test.target', (select a.user_id::text from public.admin_users a join auth.users u on u.id=a.user_id where a.level=2 limit 1), true);
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claim.sub',current_setting('test.target'),true);
  begin
    perform public.list_staff_accounts();
    raise exception 'L2 unexpectedly allowed to list staff';
  exception when insufficient_privilege then if sqlerrm <> 'STAFF_FORBIDDEN' then raise; end if; end;
  begin
    perform public.manage_staff_account(current_setting('test.actor')::uuid,'delete',null,1);
    raise exception 'L2 unexpectedly allowed';
  exception when insufficient_privilege then if sqlerrm <> 'STAFF_FORBIDDEN' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',current_setting('test.actor'),true);
  if jsonb_array_length(public.list_staff_accounts()) = 0 then raise exception 'Active list is empty'; end if;
  begin
    perform public.manage_staff_account(current_setting('test.actor')::uuid,'role',2,1);
    raise exception 'Self-change unexpectedly allowed';
  exception when raise_exception then if sqlerrm <> 'STAFF_SELF_CHANGE' then raise; end if; end;
  perform public.manage_staff_account(current_setting('test.target')::uuid,'role',1,2);
  perform set_config('request.jwt.claim.sub',current_setting('test.target'),true);
  if public.get_my_admin_level() <> 1 then raise exception 'Promotion not effective'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('test.actor'),true);
  begin
    perform public.manage_staff_account(current_setting('test.target')::uuid,'role',2,2);
    raise exception 'Stale request unexpectedly allowed';
  exception when raise_exception then if sqlerrm <> 'STAFF_CONFLICT' then raise; end if; end;
  perform public.manage_staff_account(current_setting('test.target')::uuid,'role',2,1);
  perform set_config('request.jwt.claim.sub',current_setting('test.target'),true);
  if public.get_my_admin_level() <> 2 then raise exception 'Demotion not effective'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('test.actor'),true);
  perform public.manage_staff_account(current_setting('test.target')::uuid,'delete',null,2);
  if exists(select 1 from public.admin_users where user_id=current_setting('test.target')::uuid) then raise exception 'Revocation failed'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('test.target'),true);
  if coalesce(public.get_my_admin_level(),0) in (1,2) then raise exception 'Deleted staff still authorized'; end if;
  begin
    perform public.manage_staff_account(current_setting('test.actor')::uuid,'role',2,1);
    raise exception 'Revoked staff unexpectedly allowed';
  exception when insufficient_privilege then if sqlerrm <> 'STAFF_FORBIDDEN' then raise; end if; end;
end;
$$;
reset role;
do $$
begin
  if not exists(select 1 from auth.users where id=current_setting('test.target')::uuid) then raise exception 'Login account was deleted'; end if;
  if (select count(*) from admin_staff_private.account_events where actor_id=current_setting('test.actor')::uuid and target_id=current_setting('test.target')::uuid and created_at=now()) <> 3 then raise exception 'Audit missing'; end if;
end;
$$;
-- Exercise the last-L1 guard without committing any removals.
delete from public.admin_users where level=1 and user_id<>current_setting('test.actor')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.actor'),true);
do $$
begin
  begin
    perform public.manage_staff_account(current_setting('test.actor')::uuid,'delete',null,1);
    raise exception 'Last L1 unexpectedly removable';
  exception when raise_exception then if sqlerrm <> 'STAFF_LAST_L1' then raise; end if; end;
end;
$$;
rollback;
select 'PASS: L2 denial, self guard, promotion/demotion, stale request, deletion/revocation, login preservation, audit and last-L1 guard; all changes rolled back' as result;
