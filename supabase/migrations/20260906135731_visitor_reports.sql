-- Raw visitor identifiers are only readable by L1; writes go through the server.
create table public.visitor_events (
  id uuid primary key,
  visitor_id uuid not null,
  action text not null check (action in ('page_view','filter_use','room_view','admin_click')),
  room_id uuid,
  room_code text,
  district text,
  ward text,
  created_at timestamptz not null default now(),
  check (action <> 'room_view' or room_id is not null)
);
create index visitor_events_created_idx on public.visitor_events(created_at);
create index visitor_events_visitor_created_idx on public.visitor_events(visitor_id, created_at);
alter table public.visitor_events enable row level security;
revoke all on public.visitor_events from public, anon, authenticated;
grant select on public.visitor_events to authenticated;
grant all on public.visitor_events to service_role;
create policy visitor_reports_l1 on public.visitor_events for select to authenticated
  using ((select public.get_my_admin_level()) = 1);

create function public.record_visitor_event_v1(p_id uuid, p_visitor uuid, p_action text,
  p_room uuid, p_code text, p_district text, p_ward text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  -- Bound accidental loops per visitor; serialize concurrent requests.
  perform pg_advisory_xact_lock(hashtextextended(p_visitor::text, 0));
  if (select count(*) from public.visitor_events where visitor_id=p_visitor
      and created_at > now()-interval '1 minute') >= 60 then return; end if;
  insert into public.visitor_events(id,visitor_id,action,room_id,room_code,district,ward)
  values(p_id,p_visitor,p_action,p_room,p_code,p_district,p_ward)
  on conflict(id) do nothing;
end;
$$;
revoke all on function public.record_visitor_event_v1(uuid,uuid,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.record_visitor_event_v1(uuid,uuid,text,uuid,text,text,text) to service_role;

create function public.reports_visitors_v1(p_days integer default 30)
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
    select * from public.visitor_events
    where created_at >= ((now() at time zone 'Asia/Ho_Chi_Minh')::date - (p_days-1))::timestamp at time zone 'Asia/Ho_Chi_Minh'
      and created_at <= now()
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
  ) select jsonb_build_object(
    'visitors',(select count(distinct visitor_id) from events),
    'actions',coalesce((select jsonb_agg(to_jsonb(a)) from actions a),'[]'::jsonb),
    'rooms',coalesce((select jsonb_agg(to_jsonb(r) order by views desc,room_id) from rooms r),'[]'::jsonb),
    'districts',coalesce((select jsonb_agg(to_jsonb(d) order by views desc,district) from districts d),'[]'::jsonb),
    'wards',coalesce((select jsonb_agg(to_jsonb(w) order by views desc,ward,district) from wards w),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.reports_visitors_v1(integer) from public,anon;
grant execute on function public.reports_visitors_v1(integer) to authenticated;

-- Preserve existing report calculations while enforcing L1 inside every RPC.
do $migration$
declare f record; body text; guard text := E'\n if auth.uid() is null or coalesce(public.get_my_admin_level(),0) <> 1 then raise exception ''Reports requires admin L1'' using errcode=''42501''; end if;\n';
begin
  for f in select p.oid,p.proname,p.prosrc,l.lanname,pg_get_function_result(p.oid) as result
    from pg_proc p join pg_language l on l.oid=p.prolang
    where p.pronamespace='public'::regnamespace and p.pronargs=0
      and p.proname in ('reports_overview_v1','reports_top_districts_v1','reports_top_admins_v1','reports_data_health_v1')
  loop
    if f.lanname='sql' then
      body := E'#variable_conflict use_column\nbegin ' || guard || ' return query ' || f.prosrc || E'\nend;';
    else
      body := regexp_replace(f.prosrc, '\mbegin\M', 'begin ' || guard, 'i');
    end if;
    execute format('create or replace function public.%I() returns %s language plpgsql security definer set search_path=public,pg_temp as %L',f.proname,f.result,body);
    execute format('revoke all on function public.%I() from public,anon',f.proname);
    execute format('grant execute on function public.%I() to authenticated',f.proname);
  end loop;
end;
$migration$;
