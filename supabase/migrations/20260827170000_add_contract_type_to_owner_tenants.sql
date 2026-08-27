begin;

alter function public.get_owner_tenants_v1()
  rename to get_owner_tenants_without_contract_type_v1;

create or replace function public.get_owner_tenants_v1()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(
    jsonb_agg(
      case
        when tenant_item->'active_contract' is null
          or tenant_item->'active_contract' = 'null'::jsonb
          then tenant_item
        else jsonb_set(
          tenant_item,
          '{active_contract,contract_type}',
          to_jsonb(coalesce(contract_row.contract_type, 'lease')),
          true
        )
      end
      order by tenant_item_position
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(
    public.get_owner_tenants_without_contract_type_v1()
  ) with ordinality as tenant_rows(tenant_item, tenant_item_position)
  left join public.rental_contracts contract_row
    on contract_row.id = nullif(tenant_item #>> '{active_contract,id}', '')::uuid;
$function$;

revoke all
on function public.get_owner_tenants_without_contract_type_v1()
from public, anon, authenticated;

grant execute
on function public.get_owner_tenants_without_contract_type_v1()
to service_role;

revoke all
on function public.get_owner_tenants_v1()
from public, anon;

grant execute
on function public.get_owner_tenants_v1()
to authenticated, service_role;

commit;
