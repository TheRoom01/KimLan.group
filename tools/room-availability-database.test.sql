begin;
do $test$
declare rid uuid; uid uuid; aid uuid; result jsonb; d date := (now() at time zone 'Asia/Ho_Chi_Minh')::date + 1;
begin
 select r.id, pm.user_id into rid,uid from public.rooms r join public.property_members pm on pm.property_id=r.property_id join auth.users u on u.id=pm.user_id
 where pm.status='active' and pm.role='owner' and r.lifecycle_status='active' and not coalesce(r.is_hidden,false)
 and not exists(select 1 from public.rental_contracts c where c.room_id=r.id and c.status in ('active','pending','Đang hiệu lực','Chờ nhận phòng'))
 limit 1;
 if rid is null then raise exception 'No owner fixture'; end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 result := public.update_owner_room_status_v2(rid,'Sắp trống',d-1,null);
 if result->>'new_status' <> 'Đang trống' or not exists(select 1 from public.rooms where id=rid and status='Đang trống' and available_from is null) then raise exception 'Today did not activate immediately'; end if;
 result := public.update_owner_room_status_v2(rid,'Sắp trống',d,'Kiểm thử ngày trống - rollback');
 if not exists(select 1 from public.rooms where id=rid and status='Sắp trống' and available_from=d) then raise exception 'Owner date save failed'; end if;
 perform public.update_owner_room_status_v2(rid,'Sắp trống',d+14,null);
 if not exists(select 1 from public.rooms where id=rid and available_from=d+14) then raise exception 'Date edit failed'; end if;
 begin
  perform public.update_owner_room_status_v2(rid,'Sắp trống',null,null);
  raise exception 'Missing date accepted';
 exception when sqlstate '22023' then null; end;
 perform public.update_owner_room_status_v2(rid,'Đang trống',null,null);
 if exists(select 1 from public.rooms where id=rid and available_from is not null) then raise exception 'Stale date not cleared'; end if;
 select a.user_id into aid from public.admin_users a join auth.users u on u.id=a.user_id where a.level=1 limit 1;
 if aid is null then raise exception 'No admin fixture'; end if;
 perform set_config('request.jwt.claim.sub',aid::text,true);
 result := public.update_room_status_admin_v2(rid,'Sắp trống',d-2);
 if result->>'status' <> 'Đang trống' or not exists(select 1 from public.rooms where id=rid and status='Đang trống' and available_from is null) then raise exception 'Past date did not activate immediately'; end if;
 result := public.update_room_status_admin_v2(rid,'Sắp trống',d);
 if result->>'available_from' is distinct from d::text then raise exception 'Admin save failed'; end if;
 result := public.fetch_room_detail_full_v1(rid,1);
 if result->>'available_from' is distinct from d::text then raise exception 'Detail date missing'; end if;
 result := public.fetch_admin_rooms_l1_v2(20,0,null,null);
 if not exists(select 1 from jsonb_array_elements(result->'data') e where e->>'id'=rid::text and e->>'available_from'=d::text) then raise exception 'Admin list date missing'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin
  perform public.update_room_status_admin_v2(rid,'Sắp trống',d);
  raise exception 'Unauthenticated admin update accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.update_owner_room_status_v2(rid,'Sắp trống',d,null);
  raise exception 'Unauthenticated owner update accepted';
 exception when insufficient_privilege then null; end;
 result := public.fetch_room_detail_full_v1(rid,0);
 if result->>'available_from' is distinct from d::text then raise exception 'Public detail date missing'; end if;
end;
$test$;
rollback;
select 'PASS: owner/admin save, change date, required date, clear date, list/detail data, unauthenticated denial; test data rolled back' as verification;
