import {
  createSupabaseServerClient
} from "@/lib/supabase/server";


export async function getOwnerContracts(){

  const supabase =
    await createSupabaseServerClient();



  const {
    data,
    error
  }
  =
  await supabase.rpc(
    "get_owner_contracts_v1"
  );



  if(error){

    throw error;

  }
  const contracts = data ?? [];
  if (contracts.length === 0) return [];
  const { data: visible, error: visibleError } = await supabase
    .from("rental_contracts")
    .select("id")
    .in("id", contracts.map((contract: { id: string }) => contract.id))
    .is("deleted_at", null);
  if (visibleError) throw visibleError;
  const visibleIds = new Set((visible ?? []).map((contract) => contract.id));
  return contracts.filter((contract: { id: string }) => visibleIds.has(contract.id));

}
