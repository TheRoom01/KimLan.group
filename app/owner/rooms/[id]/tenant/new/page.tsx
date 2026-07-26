import Link from "next/link";

import TenantCreateForm
from "@/components/owner/TenantCreateForm"; 


export default async function NewTenantPage({

 params

}:{

 params:Promise<{
   id:string
 }>

}) {


 const {
   id
 } = await params;



 return (

  <div
    className="
      space-y-8
    "
  >


    <div
      className="
        flex
        justify-between
        items-center
      "
    >

      <h1
        className="
          text-3xl
          font-bold
        "
      >

        Thêm khách thuê

      </h1>


      <Link

        href={`/owner/rooms/${id}`}

        className="
          rounded-lg
          border
          px-4
          py-2
        "

      >

        ← Quay lại

      </Link>


    </div>


    <TenantCreateForm

      roomId={id}

    />

  </div>

 );

}