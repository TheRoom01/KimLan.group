-- Run in a transaction after the migration. All fixture writes are rolled back.
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub', (select user_id from public.admin_users where level=1 limit 1), 'role','authenticated')::text,true);
do $$ begin
  if coalesce(public.get_my_admin_level(),0) <> 1 then raise exception 'L1 fixture required'; end if;
end $$;
set local role authenticated;
select public.reports_visitors_v1(7);
select public.reports_overview_v1();
select count(*) from public.reports_top_districts_v1();
select count(*) from public.reports_top_admins_v1();
select count(*) from public.reports_data_health_v1();
reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', (select user_id from public.admin_users where level=2 limit 1), 'role','authenticated')::text,true);
set local role authenticated;
do $$ declare f text; begin
  if (select count(*) from public.visitor_events) <> 0 then raise exception 'L2 raw data leak'; end if;
  foreach f in array array['reports_visitors_v1','reports_overview_v1','reports_top_districts_v1','reports_top_admins_v1','reports_data_health_v1'] loop
    begin
      execute format('select public.%I()',f);
      raise exception 'L2 was allowed: %', f;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
reset role;
set local role anon;
do $$ declare f text; begin
  foreach f in array array['reports_visitors_v1','reports_overview_v1','reports_top_districts_v1','reports_top_admins_v1','reports_data_health_v1'] loop
    begin
      execute format('select public.%I()',f);
      raise exception 'Anonymous was allowed: %',f;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    perform * from public.visitor_events;
    raise exception 'Anonymous raw data leak';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
-- Isolate aggregation fixtures inside the rolled-back transaction.
delete from public.visitor_events;
select public.record_visitor_event_v1('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','page_view',null,null,null,null);
select public.record_visitor_event_v1('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','page_view',null,null,null,null);
select public.record_visitor_event_v1('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','room_view','30000000-0000-4000-8000-000000000001','TEST','Quận A','Phường A');
select public.record_visitor_event_v1('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','room_view','30000000-0000-4000-8000-000000000001','TEST','Quận A','Phường A');
select public.record_visitor_event_v1('10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000002','filter_use',null,null,null,null);
insert into public.visitor_events(id,visitor_id,action,created_at) values(gen_random_uuid(),gen_random_uuid(),'page_view',now()-interval '100 days');
select set_config('request.jwt.claims', jsonb_build_object('sub', (select user_id from public.admin_users where level=1 limit 1), 'role','authenticated')::text,true);
set local role authenticated;
do $$ declare r jsonb; begin
  r := public.reports_visitors_v1(7);
  if (r->>'visitors')::int <> 2 or (r->'rooms'->0->>'views')::int <> 2 or (r->'rooms'->0->>'visitors')::int <> 1
    or (r->'districts'->0->>'views')::int <> 2 or (r->'wards'->0->>'views')::int <> 2 then
    raise exception 'Incorrect aggregation: %', r;
  end if;
  if (select (a->>'events')::int from jsonb_array_elements(r->'actions') a where a->>'action'='page_view') <> 1 then
    raise exception 'Event deduplication failed';
  end if;
  begin
    perform public.reports_visitors_v1(365);
    raise exception 'Invalid period allowed';
  exception when invalid_parameter_value then null;
  end;
end $$;
rollback;
