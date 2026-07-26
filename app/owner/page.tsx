import Link from "next/link";

import {
  getOwnerDashboard
} from "@/lib/owner/getOwnerDashboard";


export default async function OwnerPage(){


  const data =
    await getOwnerDashboard();



  const summary =
    data?.summary ?? {};



  const recentContracts =
    data?.recent_contracts ?? [];



  const expiringContracts =
    data?.expiring_contracts ?? [];



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
        Dashboard
      </h1>





      <div
        className="
          grid
          grid-cols-1
          md:grid-cols-4
          gap-5
        "
      >


        <div className="rounded-xl border bg-white p-6">

          <p className="text-gray-500">
            Tổng tòa nhà
          </p>

          <p className="mt-2 text-3xl font-bold text-blue-600">
            {summary.total_properties ?? 0}
          </p>

        </div>



        <div className="rounded-xl border bg-white p-6">

          <p className="text-gray-500">
            Tổng phòng
          </p>

          <p className="mt-2 text-3xl font-bold text-purple-600">
            {summary.total_rooms ?? 0}
          </p>

        </div>



        <div className="rounded-xl border bg-white p-6">

          <p className="text-gray-500">
            Đang thuê
          </p>

          <p className="mt-2 text-3xl font-bold text-green-600">
            {summary.rented_rooms ?? 0}
          </p>

        </div>



        <div className="rounded-xl border bg-white p-6">

          <p className="text-gray-500">
            Đang trống
          </p>

          <p className="mt-2 text-3xl font-bold">
            {summary.empty_rooms ?? 0}
          </p>

        </div>


      </div>





      <div
        className="
          rounded-xl
          border
          bg-white
          p-6
        "
      >

        <h2
          className="
            mb-5
            text-xl
            font-semibold
          "
        >
          Hợp đồng gần đây
        </h2>



        {
          recentContracts.length === 0

          ?

          (
            <p className="text-gray-500">
              Chưa có hợp đồng.
            </p>
          )

          :

          (

            <div className="space-y-4">

            {
              recentContracts.map(
                (
                  item:any,
                  index:number
                )=>(


                  <div
                    key={index}
                    className="
                      rounded-lg
                      border
                      p-4
                    "
                  >


                    <p>
                      <strong>
                        Khách thuê:
                      </strong>
                      {" "}
                      {item.tenant}
                    </p>



                    <p>
                      <strong>
                        Phòng:
                      </strong>
                      {" "}
                      {item.room}
                    </p>



                    {
                      item.monthly_price &&

                      <p>

                        <strong>
                          Giá thuê:
                        </strong>

                        {" "}

                        {
                          item.monthly_price
                          .toLocaleString(
                            "vi-VN"
                          )
                        }

                        đ

                      </p>

                    }




                    {
                      item.created_at &&

                      <p>

                        <strong>
                          Ngày tạo:
                        </strong>

                        {" "}

                        {
                          new Date(
                            item.created_at
                          )
                          .toLocaleDateString(
                            "vi-VN"
                          )
                        }

                      </p>

                    }





                    {
                      item.id &&

                      <Link

                        href={
                          `/owner/contracts/${item.id}`
                        }

                        className="
                          inline-block
                          mt-4
                          rounded-lg
                          border
                          px-4
                          py-2
                          text-sm
                        "

                      >

                        Xem hợp đồng

                      </Link>

                    }



                  </div>


                )
              )
            }

            </div>

          )

        }


      </div>






      <div
        className="
          rounded-xl
          border
          bg-white
          p-6
        "
      >


        <h2
          className="
            mb-5
            text-xl
            font-semibold
          "
        >

          Hợp đồng sắp hết hạn

        </h2>




        {
          expiringContracts.length === 0

          ?

          (

            <p className="text-gray-500">

              Không có hợp đồng sắp hết hạn.

            </p>

          )


          :

          (

            <div className="space-y-4">


              {
                expiringContracts.map(
                  (
                    item:any,
                    index:number
                  )=>(


                    <div

                      key={index}

                      className="
                        rounded-lg
                        border
                        p-4
                      "

                    >


                      <p>

                        <strong>
                          Khách thuê:
                        </strong>

                        {" "}

                        {item.tenant}

                      </p>



                      <p>

                        <strong>
                          Phòng:
                        </strong>

                        {" "}

                        {item.room}

                      </p>



                      <p>

                        <strong>
                          Hết hạn:
                        </strong>

                        {" "}

                        {
                          new Date(
                            item.end_date
                          )
                          .toLocaleDateString(
                            "vi-VN"
                          )
                        }

                      </p>


                      {
                        item.id &&

                        <Link

                          href={
                            `/owner/contracts/${item.id}`
                          }

                          className="
                            inline-block
                            mt-4
                            rounded-lg
                            border
                            px-4
                            py-2
                            text-sm
                          "

                        >

                          Xem hợp đồng

                        </Link>

                      }


                    </div>


                  )
                )

              }


            </div>

          )

        }


      </div>



    </div>

  );

}