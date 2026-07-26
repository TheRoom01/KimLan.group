import Link from "next/link";

import {
  getPropertyDetail
} from "@/lib/owner/getPropertyDetail";

import RoomCard from "@/components/owner/RoomCard";



export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {


  const {
    id
  } = await params;



  const data =
    await getPropertyDetail(id);



  const property =
    data.property;



  const summary =
    data.summary;



  const rooms =
    data.rooms;



  if (!property) {

    return (

      <div
        className="
          rounded-xl
          border
          bg-white
          p-6
        "
      >

        Không tìm thấy thông tin tòa nhà.

      </div>

    );

  }



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

          value={
            summary.total_rooms
          }

        />



        <StatCard

          title="Đã thuê"

          value={
            summary.rented_rooms
          }

          color="text-green-600"

        />



        <StatCard

          title="Đang trống"

          value={
            summary.empty_rooms
          }

        />



        <StatCard

          title="Sắp trống"

          value={
            summary.upcoming_rooms
          }

          color="text-orange-600"

        />


      </div>





      {/* Rooms */}

      <section>


        <div
          className="
            mb-4
            flex
            items-center
            justify-between
          "
        >

          <h2
            className="
              text-xl
              font-semibold
            "
          >

            Danh sách phòng

          </h2>



          <span
            className="
              text-sm
              text-gray-500
            "
          >

            {rooms.length} phòng

          </span>


        </div>





        {
          rooms.length === 0 ?


          (

            <div
              className="
                rounded-xl
                border
                bg-white
                p-6
                text-gray-500
              "
            >

              Chưa có phòng trong tòa nhà này.

            </div>

          )


          :


          (

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
                  (
                    room:any
                  ) => (

                    <RoomCard

                      key={
                        room.id
                      }

                      room={
                        room
                      }

                    />

                  )
                )
              }


            </div>

          )

        }


      </section>


    </div>

  );

}







function StatCard({
  title,
  value,
  color = "text-gray-900"

}: {

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