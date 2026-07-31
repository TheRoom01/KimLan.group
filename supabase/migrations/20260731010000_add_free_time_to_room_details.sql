begin;

alter table public.room_details
  add column if not exists free_time boolean not null default false;

-- Keep the existing permission-aware implementation and only extend its payload.
alter function public.save_room_details_v1(uuid, jsonb)
  rename to save_room_details_v1_without_free_time;

create function public.save_room_details_v1(p_room_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  perform public.save_room_details_v1_without_free_time(p_room_id, p_payload);
  if p_payload ? 'free_time' then
    update public.room_details
    set free_time = coalesce((p_payload->>'free_time')::boolean, false)
    where room_id = p_room_id;
  end if;
end;
$function$;

revoke all on function public.save_room_details_v1_without_free_time(uuid, jsonb)
from public, anon;
grant execute on function public.save_room_details_v1_without_free_time(uuid, jsonb)
to authenticated, service_role;
revoke all on function public.save_room_details_v1(uuid, jsonb)
from public, anon;
grant execute on function public.save_room_details_v1(uuid, jsonb)
to authenticated, service_role;

commit;
