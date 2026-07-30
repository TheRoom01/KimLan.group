begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null,
  title text not null,
  message text,
  reference_id uuid,
  reference_type text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx
  on public.notifications(user_id);
create index if not exists notifications_user_id_is_read_idx
  on public.notifications(user_id, is_read);
create index if not exists notifications_created_at_idx
  on public.notifications(created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on table public.notifications from public, anon;
grant select, update on table public.notifications to authenticated;
grant all on table public.notifications to service_role;

create or replace function public.notify_property_join_request_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_address text;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  select nullif(
    btrim(concat_ws(', ', p.house_number, p.address, p.ward, p.district, p.city)),
    ''
  )
  into v_address
  from public.properties p
  where p.id = new.property_id;

  insert into public.notifications (
    user_id,
    type,
    title,
    message,
    reference_id,
    reference_type
  )
  select
    pm.user_id,
    'property_owner_verification',
    'Yêu cầu xác minh quyền tòa nhà',
    'Có người yêu cầu quyền quản lý tòa nhà ' || coalesce(v_address, 'chưa cập nhật địa chỉ'),
    new.id,
    'property_join_request'
  from public.property_members pm
  where pm.property_id = new.property_id
    and pm.role = 'owner'
    and pm.status = 'active'
    and pm.user_id <> new.requester_user_id;

  return new;
end;
$function$;

drop trigger if exists property_join_request_notification_v1
  on public.property_join_requests;
create trigger property_join_request_notification_v1
  after insert on public.property_join_requests
  for each row
  execute function public.notify_property_join_request_v1();

revoke all on function public.notify_property_join_request_v1() from public, anon, authenticated;

commit;
