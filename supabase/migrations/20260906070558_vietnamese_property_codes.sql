begin;

alter table public.properties add column if not exists code_aliases text[] not null default '{}';

create or replace function public.property_code_ascii_v1(value text)
returns text language sql immutable strict set search_path = pg_catalog
as $$
  select upper(regexp_replace(replace(replace(normalize(btrim(value), NFD), 'đ', 'd'), 'Đ', 'D'), U&'[\0300-\036f]', '', 'g'));
$$;

create or replace function public.build_property_code_v3(house_number text, address text, district text)
returns text language plpgsql immutable set search_path = pg_catalog, public
as $$
declare
  h text := public.property_code_ascii_v1(coalesce(house_number,''));
  s text := public.property_code_ascii_v1(coalesce(address,''));
  d text := public.property_code_ascii_v1(coalesce(district,''));
  n text;
begin
  h := btrim(regexp_replace(h, '[^A-Z0-9/-]+', '', 'g'), '/-');
  s := regexp_replace(s, '^(DUONG|STREET)[[:space:]]+', '');
  s := btrim(regexp_replace(s, '[^A-Z0-9]+', '.', 'g'), '.');
  n := substring(d from '[0-9]+');
  if n is not null then d := 'Q' || n;
  else d := btrim(regexp_replace(d, '[^A-Z0-9]+', '.', 'g'), '.'); end if;
  return nullif(left(concat_ws('-',nullif(h,''),nullif(s,''),nullif(d,'')),200),'');
end;
$$;

create or replace function public.apply_property_code_v3()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
declare next_code text;
begin
  next_code := public.build_property_code_v3(new.house_number,new.address,new.district);
  if tg_op='UPDATE' then
    new.code_aliases := old.code_aliases;
    if old.code is distinct from next_code and nullif(btrim(old.code),'') is not null
      and not (old.code = any(new.code_aliases)) then
      new.code_aliases := array_append(new.code_aliases,old.code);
    end if;
  else
    new.code_aliases := '{}';
  end if;
  new.code := next_code;
  return new;
end;
$$;

drop trigger if exists trg_apply_property_code_v3 on public.properties;
create trigger trg_apply_property_code_v3
before insert or update of code, house_number, address, district on public.properties
for each row execute function public.apply_property_code_v3();

update public.properties
set code=public.build_property_code_v3(house_number,address,district)
where code is distinct from public.build_property_code_v3(house_number,address,district);

commit;
