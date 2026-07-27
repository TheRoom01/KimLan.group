begin;

revoke all
on function public.get_owner_tenant_detail_v1(uuid)
from public, anon;

grant execute
on function public.get_owner_tenant_detail_v1(uuid)
to authenticated, service_role;

commit;
