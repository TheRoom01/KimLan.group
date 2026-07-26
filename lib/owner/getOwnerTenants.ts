import {
  createSupabaseServerClient
} from "@/lib/supabase/server";


export async function getOwnerTenants(){


  const supabase =
    await createSupabaseServerClient();



  const {
    data,
    error

  } = await supabase.rpc(
    "get_owner_tenants_v1"
  );



  console.log(
    "RPC get_owner_tenants_v1 DATA:",
    data
  );


  console.log(
    "RPC get_owner_tenants_v1 ERROR:",
    error
  );



  if(error){

    throw error;

  }


  console.log(
  "OWNER TENANTS RESULT",
  JSON.stringify(
    data,
    null,
    2
  )
);


return data ?? [];

}