begin;

-- Add retention to the existing activity stores. This migration does not delete rows.
alter table public.visitor_events
  add column details jsonb check (details is null or (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 2048)),
  add column expires_at timestamptz,
  add column retention_hold boolean not null default false;
update public.visitor_events set expires_at = created_at + interval '30 days';
alter table public.visitor_events
  alter column expires_at set default (now() + interval '30 days'),
  alter column expires_at set not null,
  drop constraint visitor_events_action_check,
  add constraint visitor_events_action_check check (action in ('page_view','filter_use','room_view','admin_click','keyword_search'));
create index visitor_events_expiry_idx on public.visitor_events(expires_at,id) where not retention_hold;

create function public.record_visitor_event_v2(
  p_id uuid, p_visitor uuid, p_action text, p_room uuid, p_code text, p_district text, p_ward text, p_details jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  -- The API supplies validated filters or a normalized keyword. No page views.
  if p_action is null or p_action not in ('keyword_search','filter_use','room_view') then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_visitor::text, 0));
  if (select count(*) from public.visitor_events where visitor_id = p_visitor
      and created_at > now() - interval '1 minute') >= 60 then return; end if;
  insert into public.visitor_events(id,visitor_id,action,room_id,room_code,district,ward,details)
  values(p_id,p_visitor,p_action,p_room,p_code,p_district,p_ward,p_details)
  on conflict(id) do nothing;
end;
$$;
revoke all on function public.record_visitor_event_v2(uuid,uuid,text,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_visitor_event_v2(uuid,uuid,text,uuid,text,text,text,jsonb) to service_role;

create or replace function public.record_visitor_event_v1(p_id uuid, p_visitor uuid, p_action text,
  p_room uuid, p_code text, p_district text, p_ward text)
returns void language sql security invoker set search_path = '' as $$
  select public.record_visitor_event_v2(p_id,p_visitor,p_action,p_room,p_code,p_district,p_ward,null);
$$;

create or replace function public.reports_visitors_v1(p_days integer default 30)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or coalesce(public.get_my_admin_level(),0) <> 1 then
    raise exception 'Reports requires admin L1' using errcode='42501';
  end if;
  if p_days not in (7,30,90) or p_days is null then
    raise exception 'Invalid report period' using errcode='22023';
  end if;
  with events as materialized (
    select visitor_id, action, room_id, room_code, district, ward, details from public.visitor_events
    where created_at >= ((now() at time zone 'Asia/Ho_Chi_Minh')::date - (least(p_days,30)-1))::timestamp at time zone 'Asia/Ho_Chi_Minh'
      and created_at <= now() and expires_at > now()
      and action in ('keyword_search','filter_use','room_view')
  ), actions as (
    select action,count(*) as events,count(distinct visitor_id) as visitors from events group by action
  ), rooms as (
    select room_id, max(room_code) as room_code, max(district) as district, max(ward) as ward,
      count(*) as views,count(distinct visitor_id) as visitors from events where action='room_view'
    group by room_id order by views desc,room_id limit 20
  ), districts as (
    select district,count(*) as views,count(distinct visitor_id) as visitors from events
    where action='room_view' and district is not null
    group by district order by views desc,district limit 5
  ), wards as (
    select ward,district,count(*) as views,count(distinct visitor_id) as visitors from events
    where action='room_view' and ward is not null
    group by ward,district order by views desc,ward,district limit 5
  ), filters as (
    select count(*) filter (where details ?| array['minPrice','maxPrice']) as price,
      count(*) filter (where details ? 'districts') as district,
      count(*) filter (where details ? 'ward') as ward,
      count(*) filter (where details ? 'roomTypes') as room_type,
      count(*) filter (where details ? 'amenities') as amenities
    from events where action in ('keyword_search','filter_use')
  ) select jsonb_build_object(
    'visitors',(select count(distinct visitor_id) from events),
    'actions',coalesce((select jsonb_agg(to_jsonb(a)) from actions a),'[]'::jsonb),
    'rooms',coalesce((select jsonb_agg(to_jsonb(r) order by views desc,room_id) from rooms r),'[]'::jsonb),
    'districts',coalesce((select jsonb_agg(to_jsonb(d) order by views desc,district) from districts d),'[]'::jsonb),
    'wards',coalesce((select jsonb_agg(to_jsonb(w) order by views desc,ward,district) from wards w),'[]'::jsonb),
    'filters',(select to_jsonb(f) from filters f)
  ) into result;
  return result;
end;
$$;

alter table admin_staff_private.account_events
  alter column actor_id drop not null,
  alter column old_level drop not null,
  add column actor_name text,
  add column actor_role text check (actor_role in ('admin_l1','admin_l2','system')),
  add column source text not null default 'system' check (source in ('manual','system')),
  add column changed_fields text[] not null default '{}',
  add column old_data jsonb,
  add column new_data jsonb,
  add column operation_id uuid,
  add column expires_at timestamptz,
  add column retention_hold boolean not null default false,
  drop constraint account_events_action_check,
  add constraint account_events_action_check check (action in ('grant','role','delete','profile','phone','lock','unlock','signup_date'));
-- The previous writer validated L1 in the same transaction. Names were never stored.
update admin_staff_private.account_events set expires_at = created_at + interval '90 days',
  actor_role = 'admin_l1', source = 'manual', changed_fields = array['level'];
alter table admin_staff_private.account_events
  alter column expires_at set default (now() + interval '90 days'),
  alter column expires_at set not null;
create index account_events_expiry_idx on admin_staff_private.account_events(expires_at,id) where not retention_hold;

create function admin_staff_private.audit_staff_account()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_name text;
  v_role text;
  v_source text := 'system';
  v_target uuid;
  v_action text;
  v_fields text[] := '{}';
  v_old_level integer;
  v_new_level integer;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
begin
  if tg_relid = 'public.admin_users'::regclass then
    if tg_op = 'INSERT' then
      v_target := new.user_id;
      v_action := 'grant';
      v_fields := array['level'];
      v_new_level := new.level;
    elsif tg_op = 'DELETE' then
      v_target := old.user_id;
      v_action := 'delete';
      v_fields := array['level'];
      v_old_level := old.level;
    else
      v_target := new.user_id;
      if old.level is distinct from new.level then
        v_action := 'role';
        v_fields := array_append(v_fields,'level');
        v_old_level := old.level;
        v_new_level := new.level;
      end if;
      if nullif(btrim(old.phone),'') is distinct from nullif(btrim(new.phone),'') then
        v_action := coalesce(v_action,'phone');
        v_fields := array_append(v_fields,'phone');
      end if;
      if nullif(btrim(old.full_name),'') is distinct from nullif(btrim(new.full_name),'') then
        v_action := coalesce(v_action,'profile');
        v_fields := array_append(v_fields,'full_name');
      end if;
      if nullif(lower(btrim(old.email)),'') is distinct from nullif(lower(btrim(new.email)),'') then
        v_action := coalesce(v_action,'profile');
        v_fields := array_append(v_fields,'email');
      end if;
      if old.created_at is distinct from new.created_at then
        v_action := coalesce(v_action,'signup_date');
        v_fields := array_append(v_fields,'staff_created_at');
        v_old := jsonb_build_object('staff_created_at',old.created_at);
        v_new := jsonb_build_object('staff_created_at',new.created_at);
      end if;
    end if;
    if exists (select 1 from owner_audit_private.transaction_source s
      where s.transaction_id = pg_current_xact_id_if_assigned() and s.source = 'staff_manual') then
      select user_id,nullif(btrim(full_name),''),'admin_l1' into v_actor,v_name,v_role
      from public.admin_users where user_id = auth.uid() and level = 1;
      if v_actor is not null then v_source := 'manual'; end if;
    end if;
  else
    -- GoTrue/Dashboard writes can lack a verified end-user actor. Ordinary customer Auth rows are ignored.
    if not exists(select 1 from public.admin_users where user_id = new.id and level in (1,2)) then return null; end if;
    v_target := new.id;
    if old.banned_until is distinct from new.banned_until
      and (coalesce(old.banned_until > now(),false) or coalesce(new.banned_until > now(),false)) then
      v_action := case when new.banned_until > now() then 'lock' else 'unlock' end;
      v_fields := array_append(v_fields,'banned_until');
      v_old := jsonb_build_object('banned_until',old.banned_until);
      v_new := jsonb_build_object('banned_until',new.banned_until);
    end if;
    if nullif(btrim(old.phone),'') is distinct from nullif(btrim(new.phone),'') then
      v_action := coalesce(v_action,'phone');
      v_fields := array_append(v_fields,'auth_phone');
    end if;
    if nullif(lower(btrim(old.email)),'') is distinct from nullif(lower(btrim(new.email)),'') then
      v_action := coalesce(v_action,'profile');
      v_fields := array_append(v_fields,'auth_email');
    end if;
    if (old.raw_user_meta_data ->> 'full_name') is distinct from (new.raw_user_meta_data ->> 'full_name')
      or (old.raw_user_meta_data ->> 'avatar_url') is distinct from (new.raw_user_meta_data ->> 'avatar_url') then
      v_action := coalesce(v_action,'profile');
      v_fields := array_append(v_fields,'auth_profile');
    end if;
    if old.created_at is distinct from new.created_at then
      v_action := coalesce(v_action,'signup_date');
      v_fields := array_append(v_fields,'auth_created_at');
      v_old := v_old || jsonb_build_object('auth_created_at',old.created_at);
      v_new := v_new || jsonb_build_object('auth_created_at',new.created_at);
    end if;
  end if;
  if cardinality(v_fields) > 0 then
    insert into admin_staff_private.account_events(
      actor_id,actor_name,actor_role,target_id,action,source,changed_fields,old_level,new_level,old_data,new_data,operation_id
    ) values(v_actor,v_name,coalesce(v_role,'system'),v_target,v_action,v_source,v_fields,v_old_level,v_new_level,
      nullif(v_old,'{}'::jsonb),nullif(v_new,'{}'::jsonb),gen_random_uuid());
  end if;
  return null;
end;
$$;
revoke all on function admin_staff_private.audit_staff_account() from public,anon,authenticated;

create trigger audit_staff_admin_users after insert or update or delete on public.admin_users
for each row execute function admin_staff_private.audit_staff_account();
create trigger audit_staff_auth_users after update of banned_until,phone,email,created_at,raw_user_meta_data on auth.users
for each row when (old.banned_until is distinct from new.banned_until or old.phone is distinct from new.phone
  or old.email is distinct from new.email or old.created_at is distinct from new.created_at
  or old.raw_user_meta_data is distinct from new.raw_user_meta_data)
execute function admin_staff_private.audit_staff_account();

-- The previous explicit insert is replaced by the transactional trigger.
create or replace function admin_staff_private.manage_account(
  p_user_id uuid, p_action text, p_level integer, p_expected_level integer
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_level integer;
  v_old_level integer;
begin
  lock table public.admin_users in share row exclusive mode;
  select level into v_actor_level from public.admin_users where user_id = v_actor;
  if v_actor is null or v_actor_level is distinct from 1 then
    raise exception 'STAFF_FORBIDDEN' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('delete','role')
    or p_expected_level is null or p_expected_level not in (1,2)
    or (p_action = 'role' and (p_level is null or p_level not in (1,2))) then
    raise exception 'STAFF_INVALID_INPUT';
  end if;
  select level into v_old_level from public.admin_users where user_id = p_user_id;
  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
  if v_old_level = 1 and (p_action = 'delete' or p_level <> 1)
    and (select count(*) from public.admin_users where level=1) <= 1 then
    raise exception 'STAFF_LAST_L1';
  end if;
  if p_user_id = v_actor then raise exception 'STAFF_SELF_CHANGE'; end if;
  if v_old_level is distinct from p_expected_level then raise exception 'STAFF_CONFLICT'; end if;
  if p_action = 'delete' then
    delete from public.admin_users where user_id = p_user_id;
  elsif v_old_level is distinct from p_level then
    update public.admin_users set level = p_level where user_id = p_user_id;
  end if;
end;
$$;
select owner_audit_private.instrument_source(
  'admin_staff_private.grant_account(text,text,text,integer)'::regprocedure, 'staff_manual'
);
select owner_audit_private.instrument_source(
  'admin_staff_private.manage_account(uuid,text,integer,integer)'::regprocedure, 'staff_manual'
);

create function public.reports_staff_audit_v1()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(public.get_my_admin_level(),0) <> 1 then
    raise exception 'Reports requires admin L1' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(e) order by e.id desc),'[]'::jsonb) from (
    select id,actor_id,actor_name,actor_role,target_id,action,source,changed_fields,created_at,expires_at,operation_id,
      coalesce(old_data,'{}'::jsonb) || case when old_level is null then '{}'::jsonb else jsonb_build_object('level',old_level) end as old_data,
      coalesce(new_data,'{}'::jsonb) || case when new_level is null then '{}'::jsonb else jsonb_build_object('level',new_level) end as new_data
    from admin_staff_private.account_events where expires_at > now() or retention_hold
    order by id desc limit 50
  ) e);
end;
$$;
revoke all on function public.reports_staff_audit_v1() from public,anon;
grant execute on function public.reports_staff_audit_v1() to authenticated;

commit;
