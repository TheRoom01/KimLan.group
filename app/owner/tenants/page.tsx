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


    const activeContract =
      item.active_contract;


    const contractsCount =
      item.contracts_count ?? 0;



    return (

      <div

        key={
          tenant.id
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



        {
          activeContract
          ?

          <>

            <p>

              Tòa nhà:

              {" "}

              {
                activeContract.property?.name
                ??
                "-"
              }

            </p>



            <p>

              Phòng:

              {" "}

              {
                activeContract.room?.room_code
                ??
                "-"
              }

            </p>



            <p>

              Giá thuê:

              {" "}

              {
                activeContract.monthly_price
                ?
                Number(
                  activeContract.monthly_price
                ).toLocaleString(
                  "vi-VN"
                )
                :
                "-"
              }

              đ

            </p>


          </>

          :

          (

            <p className="
              text-gray-500
            "
            >

              Chưa có hợp đồng đang hiệu lực.

            </p>

          )

        }



        <p
          className="
            mt-3
            text-sm
            text-gray-500
          "
        >

          Tổng số hợp đồng:

          {" "}

          {contractsCount}

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