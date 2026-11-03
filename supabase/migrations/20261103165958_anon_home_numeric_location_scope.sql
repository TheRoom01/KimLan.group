do $migration$
declare definition text;
begin
 select pg_get_functiondef(oid) into strict definition from pg_proc where pronamespace='public'::regnamespace and proname='fetch_rooms_cursor_full_v1';
 definition := replace(definition,chr(13),'');
 if position('s is null or case' in definition)=0 then raise exception 'Anon scope patch target missing'; end if;
 definition := replace(definition, 's is null or case', $scope$s is null or case
          when p_search ~* '^\s*(phường|phuong|quận|quan)\s+[0-9]{1,3}\s*$' then true$scope$);
 execute definition;
end;
$migration$;
