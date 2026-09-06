-- Midnight in Vietnam is 17:00 UTC. Reuse the existing job by name.
select cron.schedule('activate-due-room-availability', '0 17 * * *',
  'select public.activate_due_room_availability_v1();');

-- Normalize inputs before existing permission checks and writes. This keeps
-- status logs and RPC return values consistent with the stored status.
do $migration$
declare
  signature text;
  definition text;
  injection text;
begin
  foreach signature in array array[
    'public.create_owner_room_full_v3(uuid,jsonb)',
    'public.update_owner_room_full_v2(uuid,jsonb)',
    'public.admin_upsert_room_v3(uuid,jsonb)',
    'public.admin_l1_save_hidden_room_v1(uuid,jsonb,text)',
    'public.update_owner_room_status_v2(uuid,text,date,text)',
    'public.update_room_status_admin_v2(uuid,text,date)'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    if signature like '%jsonb%' then
      injection := $sql$
  if p_payload->>'status' = 'Sắp trống'
     and nullif(p_payload->>'available_from', '')::date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    p_payload := p_payload || jsonb_build_object('status', 'Đang trống', 'available_from', null);
  end if;
$sql$;
    else
      injection := $sql$
  if STATUS_ARGUMENT = 'Sắp trống'
     and p_available_from <= (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    STATUS_ARGUMENT := 'Đang trống';
    p_available_from := null;
  end if;
$sql$;
      injection := replace(injection, 'STATUS_ARGUMENT',
        case when signature like '%update_owner_room_status%' then 'p_new_status' else 'p_status' end);
    end if;
    if definition !~* E'\n[bB][eE][gG][iI][nN]\\s' then
      raise exception 'Cannot locate function body: %', signature;
    end if;
    definition := regexp_replace(definition, E'(\n[bB][eE][gG][iI][nN]\\s)', E'\\1' || injection);
    execute definition;
  end loop;
end;
$migration$;

select public.activate_due_room_availability_v1();
