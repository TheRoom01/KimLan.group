import { createSupabaseServerClient } from "../supabase/server";

const UPCOMING_ROOM_DAYS = 30;


export async function getProperties() {

  const supabase =
    await createSupabaseServerClient();
  const {
  data:userData
}
=
await supabase.auth.getUser();


const user =
  userData.user;
console.log(
  "CURRENT USER:",
  user?.id
);

if(!user){

  throw new Error(
    "Unauthorized"
  );

}

  const { data, error } = await supabase
  .from("properties")
  .select(`

    id,
    code,
    name,
    house_number,
    address,
    district,
    city,
    cover_image,
    status,
    created_at,


    property_owners!inner(

      user_id

    ),


    rooms!rooms_property_id_fkey (

      id,
      status,

      rental_contracts (

        status,
        end_date

      )

    )

  `)

  .eq(
    "property_owners.user_id",
    user.id
  )

  .order("name");


  if (error) {

    console.error(
      "[Owner] getProperties:",
      error
    );

    throw error;

  }



  const today = new Date();



  return (data ?? []).map(
    (property:any)=>{


      let rentedRooms = 0;
      let emptyRooms = 0;
      let upcomingRooms = 0;



      property.rooms?.forEach(
        (room:any)=>{


          const contract =
            room.rental_contracts?.[0];



          if (
            contract?.status ===
            "Đang hiệu lực"
          ) {


            const endDate =
              new Date(
                contract.end_date
              );


            const diffDays =
              Math.ceil(
                (
                  endDate.getTime()
                  -
                  today.getTime()
                )
                /
                (
                  1000 *
                  60 *
                  60 *
                  24
                )
              );


            if (
              diffDays <=
              UPCOMING_ROOM_DAYS
            ) {

              upcomingRooms++;

            } else {

              rentedRooms++;

            }


          }

          else if (
            contract?.status ===
            "Chờ nhận phòng"
          ) {

            rentedRooms++;

          }

          else {

            emptyRooms++;

          }


        }
      );



      return {

        ...property,


        total_rooms:
          property.rooms?.length ?? 0,


        rented_rooms:
          rentedRooms,


        empty_rooms:
          emptyRooms,


        upcoming_rooms:
          upcomingRooms,


      };


    }
  );

}