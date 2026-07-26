import Link from "next/link";

import {
  getRoomDetail
} from "@/lib/owner/getRoomDetail";


import EditRoomForm from "@/components/owner/EditRoomForm";



export default async function EditRoomPage({

  params,

}:{

  params:Promise<{
    id:string;
  }>

}) {


  const {
    id
  } = await params;



  const room =
    await getRoomDetail(id);



  return (

    <div
      className="
        space-y-8
      "
    >


      <div
        className="
          flex
          items-center
          justify-between
        "
      >


        <div>

          <h1
            className="
              text-3xl
              font-bold
            "
          >

            Chỉnh sửa phòng {room.room_code}

          </h1>


          <p
            className="
              text-gray-500
            "
          >

            Cập nhật thông tin phòng

          </p>


        </div>



        <Link

          href={`/owner/rooms/${room.id}`}

          className="
            rounded-lg
            border
            px-4
            py-2
            hover:bg-gray-100
          "

        >

          ← Quay lại

        </Link>


      </div>


      <EditRoomForm

        room={room}

      />


    </div>

  );

}