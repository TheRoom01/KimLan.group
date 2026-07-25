import Link from "next/link";

interface PropertyCardProps {
  property: {
    id: string;
    house_number?: string | null;
    address?: string | null;
    district?: string | null;
    city?: string | null;
    status?: string | null;
    total_rooms?: number;
    rented_rooms?: number;
    empty_rooms?: number;
    upcoming_rooms?: number;
  };
}


function getStatusLabel(status?: string | null) {

  switch (status) {

    case "active":
      return {
        text: "Hoạt động",
        className:
          "bg-green-100 text-green-700",
      };

    case "inactive":
      return {
        text: "Tạm dừng",
        className:
          "bg-gray-100 text-gray-700",
      };

    case "archived":
      return {
        text: "Lưu trữ",
        className:
          "bg-red-100 text-red-700",
      };

    default:
      return {
        text: "Nháp",
        className:
          "bg-yellow-100 text-yellow-700",
      };

  }

}


export default function PropertyCard({
  property,
}: PropertyCardProps) {


  const displayName =
    [
      property.house_number,
      property.address,
    ]
      .filter(Boolean)
      .join(" ") ||
    "Chưa có địa chỉ";


  const status =
    getStatusLabel(property.status);


  return (

    <div
      className="
        overflow-hidden
        rounded-2xl
        border
        bg-white
        shadow-sm
        transition
        hover:shadow-md
      "
    >


      {/* Cover */}

      <div
        className="
          relative
          aspect-video
          bg-gray-100
        "
      >

        <img
          src="https://placehold.co/800x450?text=Building"
          alt={displayName}
          className="
            h-full
            w-full
            object-cover
          "
        />


        <span
          className={`
            absolute
            right-3
            top-3
            rounded-full
            px-3
            py-1
            text-xs
            font-medium
            ${status.className}
          `}
        >
          {status.text}
        </span>


      </div>



      {/* Content */}

      <div
        className="
          space-y-4
          p-5
        "
      >


        <div>

          <h2
            className="
              text-lg
              font-semibold
              text-gray-900
            "
          >
            {displayName}
          </h2>


          <p
            className="
              mt-1
              text-sm
              text-gray-500
            "
          >
            📍 {property.district}
            {property.city &&
              ` • ${property.city}`}
          </p>


        </div>



        {/* Stats */}

        <div
          className="
            grid
            grid-cols-3
            gap-2
            text-center
          "
        >

          <div
            className="
              rounded-lg
              bg-gray-50
              p-2
            "
          >

            <p
              className="
                text-lg
                font-semibold
              "
            >
              {property.total_rooms ?? 0}
            </p>

            <p
              className="
                text-xs
                text-gray-500
              "
            >
              Phòng
            </p>

          </div>



          <div
            className="
              rounded-lg
              bg-green-50
              p-2
            "
          >

            <p
              className="
                text-lg
                font-semibold
                text-green-700
              "
            >
              {property.rented_rooms ?? 0}
            </p>

            <p
              className="
                text-xs
                text-gray-500
              "
            >
              Đã thuê
            </p>

          </div>



          <div
            className="
              rounded-lg
              bg-gray-50
              p-2
            "
          >

            <p
              className="
                text-lg
                font-semibold
              "
            >
              {property.empty_rooms ?? 0}
            </p>

            <p
              className="
                text-xs
                text-gray-500
              "
            >
              Trống
            </p>

          </div>


        </div>



        <Link
          href={`/owner/properties/${property.id}`}
          className="
            block
            rounded-xl
            bg-black
            px-4
            py-2
            text-center
            text-sm
            font-medium
            text-white
            transition
            hover:bg-gray-800
          "
        >

          Xem chi tiết →

        </Link>


      </div>


    </div>

  );

}