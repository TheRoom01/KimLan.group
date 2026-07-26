import {
  createSupabaseServerClient
} from "@/lib/supabase/server";



export async function getRoomStatusLogs(
  roomId:string
){

  const supabase =
    await createSupabaseServerClient();



  const {
    data,
    error
  } =
  await supabase
    .from("room_status_logs")
    .select(`
      id,

      old_status,

      new_status,

      changed_by,

      note,

      changed_at
    `)
    .eq(
      "room_id",
      roomId
    )
    .order(
      "changed_at",
      {
        ascending:false
      }
    );



  if(error){

    throw error;

  }



  return data ?? [];

}