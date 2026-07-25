import Link from "next/link";


interface RoomCardProps {

  room:any;

}


export default function RoomCard({
  room
}:RoomCardProps){


  const status =
    room.displayStatus ??
    room.status;


  const statusStyle =
    status === "Đã thuê"
      ? "bg-green-100 text-green-700"
      :
    status === "Sắp trống"
      ? "bg-orange-100 text-orange-700"
      :
      "bg-gray-100 text-gray-700";


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

      <div
        className="
          flex
          items-start
          justify-between
        "
      >

        <div>

          <h3
            className="
              text-lg
              font-semibold
            "
          >
            Phòng {room.room_code}
          </h3>


          <p
            className="
              text-sm
              text-gray-500
            "
          >
            {room.room_type}
          </p>


        </div>

        <span
          className={`
            rounded-full
            px-3
            py-1
            text-xs
            font-medium
            ${statusStyle}
          `}
        >

          {status}

        </span>
      </div>

      <div
        className="
          mt-4
          space-y-2
          text-sm
        "
      >
        <p>

          Giá:
          <strong className="ml-1">
            {room.price?.toLocaleString("vi-VN")}
            {" "}đ
          </strong>

        </p>


        {
          room.daysRemaining !== null &&
          room.daysRemaining !== undefined &&
          (

            <p
              className="
                text-orange-600
              "
            >

              Còn {room.daysRemaining} ngày hợp đồng

            </p>

          )
        }


      </div>

      <Link
        href={`/owner/rooms/${room.id}`}
        className="
          mt-4
          block
          rounded-lg
          border
          px-3
          py-2
          text-center
          text-sm
          hover:bg-gray-50
        "
      >

        Xem phòng →

      </Link>


    </div>

  );

}