-- Vacancy dates are interpreted in Vietnam, independently of the DB session timezone.
create or replace function public.activate_due_room_availability_v1()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare changed_count integer;
begin
  update public.rooms
  set status = 'Đang trống',
      available_from = null,
      status_source = 'owner',
      updated_at = now()
  where status = 'Sắp trống'
    and available_from <= (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

-- Only the database scheduler/administrator runs this maintenance function.
revoke all on function public.activate_due_room_availability_v1() from public, anon, authenticated;

select cron.schedule(
  'activate-due-room-availability',
  '* * * * *',
  'select public.activate_due_room_availability_v1();'
);

-- Catch up any dates that have already arrived.
select public.activate_due_room_availability_v1();
