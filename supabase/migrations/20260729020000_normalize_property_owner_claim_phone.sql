/*
 * Admin room creation accepts a free-form zalo_phone field (labels, spaces,
 * emoji and multiple formatting styles). Protect the room transaction from a
 * property_owner_claims_phone_check failure by normalizing at the table
 * boundary. Invalid values are ignored as claims; they must never roll back an
 * otherwise valid room/property insert.
 */

create or replace function public.normalize_property_owner_claim_phone_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  new.phone := public.admin_normalize_phone_v1(new.phone);

  if new.phone is null or new.phone !~ '^[0-9]+$' then
    return null;
  end if;

  return new;
end;
$function$;

drop trigger if exists normalize_property_owner_claim_phone_v1
on public.property_owner_claims;

create trigger normalize_property_owner_claim_phone_v1
before insert or update of phone
on public.property_owner_claims
for each row
execute function public.normalize_property_owner_claim_phone_v1();

revoke all
on function public.normalize_property_owner_claim_phone_v1()
from public, anon, authenticated;

grant execute
on function public.normalize_property_owner_claim_phone_v1()
to service_role;
