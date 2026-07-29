alter table public.properties
  add column if not exists default_room_data jsonb not null default '{}'::jsonb;

alter table public.property_media
  add column if not exists type text not null default 'image',
  add column if not exists path text;

alter table public.property_media
  drop constraint if exists property_media_type_check;

alter table public.property_media
  add constraint property_media_type_check check (type in ('image', 'video'));

create or replace function public.sync_owner_property_media_v1(p_property_id uuid, p_media jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not public.can_manage_property(p_property_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  delete from public.property_media where property_id = p_property_id;
  insert into public.property_media (property_id, url, type, is_cover, sort_order)
  select p_property_id,
         item.value,
         case when item.value ~* '/video/|\.(mp4|webm|mov|m4v)(\?|$)' then 'video' else 'image' end,
         item.ordinality = 1,
         item.ordinality - 1
  from jsonb_array_elements_text(coalesce(p_media, '[]'::jsonb)) with ordinality as item(value, ordinality);
end;
$function$;

revoke all on function public.sync_owner_property_media_v1(uuid, jsonb) from public, anon;
grant execute on function public.sync_owner_property_media_v1(uuid, jsonb) to authenticated, service_role;
