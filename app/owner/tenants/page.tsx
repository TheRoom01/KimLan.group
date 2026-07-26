import {
  getOwnerTenants
} from "@/lib/owner/getOwnerTenants";

import Link from "next/link";


export default async function TenantsPage() {


  const tenants =
    await getOwnerTenants();



  return (

    <div
      className="
        space-y-8
      "
    >


      <h1
        className="
          text-3xl
          font-bold
        "
      >
        Khách thuê
      </h1>





      <div
        className="
          grid
          gap-5
        "
      >


        {
          tenants.length === 0


          ?


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

              Chưa có khách thuê.

            </div>

          )


          :


          tenants.map(
            (
              item:any
            ) => {


              const tenant =
                item.tenant;



              if(!tenant){

                return null;

              }



              return (

                <div

                  key={
                    item.contract_id
                  }

                  className="
                    rounded-xl
                    border
                    bg-white
                    p-6
                  "

                >



                  <h2
                    className="
                      text-xl
                      font-semibold
                    "
                  >

                    {tenant.full_name}

                  </h2>





                  {
                    item.status === "Đã kết thúc"

                    &&

                    (

                      <span
                        className="
                          mt-2
                          inline-block
                          rounded-full
                          bg-gray-100
                          px-3
                          py-1
                          text-xs
                          text-gray-600
                        "
                      >

                        Đã kết thúc HĐ

                      </span>

                    )

                  }






                  <p>

                    SĐT:

                    {" "}

                    {tenant.phone ?? "-"}

                  </p>





                  <p>

                    CCCD:

                    {" "}

                    {tenant.cccd ?? "-"}

                  </p>





                  <hr
                    className="
                      my-4
                    "
                  />





                  <p>

                    Tòa nhà:

                    {" "}

                    {
                      item.property?.name
                      ??
                      item.property?.address
                      ??
                      "-"
                    }

                  </p>





                  <p>

                    Phòng:

                    {" "}

                    {
                      item.room?.room_code
                      ??
                      "-"
                    }

                  </p>





                  <p>

                    Giá thuê:

                    {" "}

                    {
                      item.monthly_price
                      ?
                      item.monthly_price.toLocaleString(
                        "vi-VN"
                      )
                      :
                      "-"
                    }

                    đ

                  </p>







                  <Link

                    href={
                      `/owner/tenants/${tenant.id}`
                    }

                    className="
                      mt-4
                      inline-block
                      rounded-lg
                      border
                      px-4
                      py-2
                      text-sm
                      hover:bg-gray-100
                    "

                  >

                    Xem chi tiết

                  </Link>





                </div>

              );


            }

          )

        }


      </div>


    </div>

  );

}