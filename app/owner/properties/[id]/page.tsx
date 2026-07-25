import { getProperty } from "../../../../lib/owner/getProperty";
import { getPropertyRooms } from "../../../../lib/owner/getPropertyRooms";
import Link from "next/link";
import RoomCard from "../../../../components/owner/RoomCard";


export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {

  const { id } = await params;


  const property =
    await getProperty(id);


  const rooms =
    await getPropertyRooms(id);



  const totalRooms =
    rooms.length;


  const rentedRooms =
    rooms.filter(
      (room:any) =>
        room.displayStatus === "Đã thuê"
    ).length;


  const emptyRooms =
    rooms.filter(
      (room:any) =>
        room.displayStatus === "Đang trống"
    ).length;


  const upcomingRooms =
    rooms.filter(
      (room:any) =>
        room.displayStatus === "Sắp trống"
    ).length;



  return (

    <div
      className="
        space-y-8
      "
    >


      {/* Header */}

      <div
        className="
          flex
          flex-col
          gap-4
          md:flex-row
          md:items-center
          md:justify-between
        "
      >

        <div>

          <h1
            className="
              text-3xl
              font-bold
            "
          >
            {property.name}
          </h1>


          <p
            className="
              mt-2
              text-gray-500
            "
          >
            📍 {property.address}
          </p>


          <p
            className="
              text-sm
              text-gray-400
            "
          >
            {property.district}
            {" • "}
            {property.city}
          </p>


        </div>



        <Link
          href="/owner/properties"
          className="
            rounded-lg
            border
            px-4
            py-2
            text-sm
            hover:bg-gray-50
          "
        >

          ← Danh sách tòa nhà

        </Link>


      </div>




      {/* Statistics */}

      <div
        className="
          grid
          grid-cols-2
          gap-4
          md:grid-cols-4
        "
      >


        <StatCard
          title="Tổng phòng"
          value={totalRooms}
        />


        <StatCard
          title="Đã thuê"
          value={rentedRooms}
          color="text-green-600"
        />


        <StatCard
          title="Đang trống"
          value={emptyRooms}
        />


        <StatCard
          title="Sắp trống"
          value={upcomingRooms}
          color="text-orange-600"
        />


      </div>





      {/* Rooms */}

      <div>

        <h2
          className="
            mb-4
            text-xl
            font-semibold
          "
        >
          Danh sách phòng
        </h2>



        <div
          className="
            grid
            grid-cols-1
            gap-5
            sm:grid-cols-2
            xl:grid-cols-3
          "
        >

          {
            rooms.map(
              (room:any)=>(

                <RoomCard
                  key={room.id}
                  room={room}
                />

              )
            )
          }


        </div>


      </div>


    </div>

  );

}




function StatCard({
  title,
  value,
  color="text-gray-900"
}:{
  title:string;
  value:number;
  color?:string;
}) {


  return (

    <div
      className="
        rounded-xl
        border
        bg-white
        p-4
        shadow-sm
      "
    >

      <p
        className="
          text-sm
          text-gray-500
        "
      >
        {title}
      </p>


      <p
        className={`
          mt-1
          text-2xl
          font-bold
          ${color}
        `}
      >
        {value}
      </p>


    </div>

  );

}