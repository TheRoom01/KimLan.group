-- Compare all Home search branches with admin order, preserving selected filters.
-- No rows or authentication state survive this transaction.
begin;
do $test$
declare
  admin_uid uuid;
  test_uid uuid;
  anon_id uuid;
  role_level integer;
  q text;
  selected_term text;
  sort_mode text;
  h jsonb;
  a jsonb;
  c jsonb;
  actual jsonb;
  expected jsonb;
  pages integer;
  cases integer := 0;
begin
  select user_id into strict admin_uid from public.admin_users where level=1 limit 1;
  foreach role_level in array array[0,1,2] loop
    if role_level=0 then test_uid := null;
    else select user_id into strict test_uid from public.admin_users where level=role_level limit 1;
    end if;
    foreach q in array array['257/17','257/17 Phan Xích','Phan Xích','257'] loop
      foreach selected_term in array array[null::text,'long','short'] loop
        perform set_config('request.jwt.claim.sub',coalesce(test_uid,admin_uid)::text,true);
        if role_level=2 then a := public.fetch_admin_rooms_l2_v2(10000,0,q,null);
        else a := public.fetch_admin_rooms_l1_v2(10000,0,q,null);
        end if;
        select coalesce(jsonb_agg(x->'id' order by ord),'[]'::jsonb) into expected
        from jsonb_array_elements(a->'data') with ordinality t(x,ord)
        join public.rooms r on r.id=(x->>'id')::uuid
        left join public.room_details rd on rd.room_id=r.id
        where coalesce(r.is_hidden,false)=false
          and (role_level<>0 or exists(select 1 from public.room_full_public v where v.id=r.id))
          and (selected_term is null
            or (selected_term='long' and coalesce(rd.long_term,true))
            or (selected_term='short' and coalesce(rd.short_term,false)));
        if q='Phan Xích' and selected_term is null and jsonb_array_length(expected)=0 then
          raise exception 'Control query must return real rows';
        end if;
        perform set_config('request.jwt.claim.sub',coalesce(test_uid::text,''),true);
        if role_level=0 then anon_id := public.start_anon_session(null); end if;
        foreach sort_mode in array array['updated_desc','price_asc','price_desc'] loop
          actual := '[]'::jsonb; c := null; pages := 0;
          loop
            h := public.fetch_rooms_cursor_full_v1(role_level,7,(c->>'id')::uuid,q,null,null,null,null,null,
              p_contract_terms=>case when selected_term is null then null else array[selected_term] end,
              p_sort=>sort_mode,
              p_cursor_updated_at=>(c->>'updated_at')::timestamptz,
              p_cursor_created_at=>(c->>'created_at')::timestamptz,
              p_cursor_id=>(c->>'id')::uuid,p_anon_session_id=>anon_id);
            if (h->>'total_count')::integer <> jsonb_array_length(expected) then
              raise exception 'Count mismatch: role %, query %, term %',role_level,q,selected_term;
            end if;
            select actual || coalesce(jsonb_agg(x->'id' order by ord),'[]'::jsonb) into actual
            from jsonb_array_elements(h->'data') with ordinality t(x,ord);
            c := h->'nextCursor'; pages := pages+1;
            exit when c is null or c='null'::jsonb;
            if pages>100 then raise exception 'Pagination did not terminate'; end if;
          end loop;
          if actual <> expected then
            raise exception 'Order mismatch: role %, query %, term %, sort %',role_level,q,selected_term,sort_mode;
          end if;
          cases := cases+1;
        end loop;
      end loop;
    end loop;
  end loop;
  if cases<>108 then raise exception 'Not all 108 cases ran'; end if;
end;
$test$;
select '108 Home/admin search, filter, sort and pagination cases passed' as result;
rollback;
