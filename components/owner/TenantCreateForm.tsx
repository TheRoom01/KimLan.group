"use client";


import {
 useState
} from "react";


import {
 useRouter
} from "next/navigation";



export default function TenantCreateForm({

 roomId

}:{

 roomId:string

}){


 const router =
 useRouter();



 const [form,setForm]
 =
 useState({

  full_name:"",

  phone:"",

  cccd:"",

  start_date:"",

  end_date:"",

  monthly_price:0,

  deposit_amount:0

 });



 const [loading,setLoading]
 =
 useState(false);



 async function submit(){


  setLoading(true);



  const res =
  await fetch(

    `/api/owner/rooms/${roomId}/tenant`,

    {

      method:"POST",

      headers:{

        "Content-Type":
        "application/json"

      },


      body:
      JSON.stringify(form)

    }

  );



  if(res.ok){

  router.push(
    `/owner/rooms/${roomId}`
  );

  router.refresh();

}
else {

  const error =
    await res.json();


  console.error(
    error
  );


  alert(
    error.error ??
    "Tạo hợp đồng thất bại"
  );

}



  setLoading(false);

 }



 return (

 <div
 className="
 rounded-xl
 border
 bg-white
 p-6
 space-y-5
 "
 >


 {[
  ["full_name","Họ tên"],
  ["phone","Số điện thoại"],
  ["cccd","CCCD"],
  ["start_date","Ngày bắt đầu"],
  ["end_date","Ngày kết thúc"],
 ].map(([key,label])=>(

 <div key={key}>

 <label>
 {label}
 </label>


 <input

 className="
 mt-1
 w-full
 rounded-lg
 border
 p-2
 "

 type={
  key.includes("date")
  ?
  "date"
  :
  "text"
 }


 value={(form as any)[key]}


 onChange={
 e=>
 setForm({

 ...form,

 [key]:
 e.target.value

 })
 }


 />

 </div>


 ))}



 <div>

 <label>
 Giá thuê
 </label>


 <input

 type="number"

 className="
 mt-1
 w-full
 rounded-lg
 border
 p-2
 "

 onChange={
 e=>
 setForm({

 ...form,

 monthly_price:
 Number(e.target.value)

 })
 }

 />

 </div>




 <div>

 <label>
 Tiền cọc
 </label>


 <input

 type="number"

 className="
 mt-1
 w-full
 rounded-lg
 border
 p-2
 "

 onChange={
 e=>
 setForm({

 ...form,

 deposit_amount:
 Number(e.target.value)

 })
 }

 />

 </div>




 <button

 onClick={submit}

 disabled={loading}

 className="
 rounded-lg
 bg-blue-600
 px-5
 py-2
 text-white
 "

 >

 {
 loading
 ?
 "Đang tạo..."
 :
 "Tạo hợp đồng"
 }


 </button>



 </div>

 );

}