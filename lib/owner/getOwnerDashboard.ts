import {
  createSupabaseServerClient
} from "@/lib/supabase/server";


export async function getOwnerDashboard(){

  const supabase =
    await createSupabaseServerClient();


  const {
    data,
    error
  }
  =
  await supabase.rpc(
    "get_owner_dashboard_v1",
    {
      p_attention_limit: 5,
      p_activity_limit: 5
    }
  );



  if(error){

    console.error(
      "getOwnerDashboard error:",
      error
    );


    throw error;

  }



  return data;

}