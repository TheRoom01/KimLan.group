-- Run after the migration. All temporary room data and audit rows are rolled back.
begin;
do $test$
declare
  property uuid;
  due_id uuid := gen_random_uuid();
  future_id uuid := gen_random_uuid();
  undated_id uuid := gen_random_uuid();
  today_vn date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  select id into property from public.properties where lifecycle_status = 'active' limit 1;
  if property is null then raise exception 'No test property available'; end if;
  insert into public.rooms(id, property_id, room_code, status, available_from, lifecycle_status, publish_status)
  values
    (due_id, property, 'AVAIL-TEST-' || due_id, 'Sắp trống', today_vn, 'active', 'draft'),
    (future_id, property, 'AVAIL-TEST-' || future_id, 'Sắp trống', today_vn + 1, 'active', 'draft'),
    (undated_id, property, 'AVAIL-TEST-' || undated_id, 'Sắp trống', null, 'active', 'draft');
  perform public.activate_due_room_availability_v1();
  if not exists(select 1 from public.rooms where id = due_id and status = 'Đang trống' and available_from is null and status_source = 'owner') then
    raise exception 'Due room was not activated';
  end if;
  if not exists(select 1 from public.rooms where id = future_id and status = 'Sắp trống' and available_from = today_vn + 1) then
    raise exception 'Future room was changed';
  end if;
  if not exists(select 1 from public.rooms where id = undated_id and status = 'Sắp trống' and available_from is null) then
    raise exception 'Undated room was changed';
  end if;
  if public.activate_due_room_availability_v1() <> 0 then raise exception 'Maintenance is not idempotent'; end if;
end;
$test$;
rollback;
select 'PASS: due date, future date, legacy undated room, repeated run; all test data rolled back' as verification;
