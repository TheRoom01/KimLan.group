"use client";


import {
  useState
} from "react";


import {
  useRouter
} from "next/navigation";



interface Props {

  room:any;

}



export default function EditRoomForm({

  room

}:Props){



  const router =
    useRouter();



  const [loading,setLoading]
    = useState(false);



  const [form,setForm]
    = useState({

      room_type:
        room.room_type ?? "",


      price:
        room.price ?? 0,


      description:
        room.description ?? "",


      status:
        room.status ?? "Đang trống"

    });



  async function submit(){


    try{


      setLoading(true);



      const res =
        await fetch(
          `/api/owner/rooms/${room.id}`,
          {

            method:"PATCH",

            headers:{
              "Content-Type":
                "application/json"
            },


            body:
              JSON.stringify(form)

          }
        );



      if(!res.ok){

        throw new Error(
          "Update room failed"
        );

      }



      router.push(
        `/owner/rooms/${room.id}`
      );


      router.refresh();



    }

    catch(error){

      console.error(error);

      alert(
        "Cập nhật phòng thất bại"
      );

    }

    finally{

      setLoading(false);

    }


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


      <div>

        <label>
          Loại phòng
        </label>


        <input

          className="
            mt-1
            w-full
            rounded-lg
            border
            p-2
          "

          value={form.room_type}

          onChange={
            e=>
              setForm({
                ...form,
                room_type:e.target.value
              })
          }

        />

      </div>





      <div>

        <label>
          Giá phòng
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

          value={form.price}

          onChange={
            e=>
              setForm({
                ...form,
                price:Number(
                  e.target.value
                )
              })
          }

        />

      </div>





      <div>

        <label>
          Mô tả
        </label>


        <textarea

          className="
            mt-1
            w-full
            rounded-lg
            border
            p-2
          "


          rows={5}


          value={form.description}


          onChange={
            e=>
              setForm({
                ...form,
                description:e.target.value
              })
          }

        />


      </div>





      <div>


        <label>
          Trạng thái
        </label>


        <select

          className="
            mt-1
            w-full
            rounded-lg
            border
            p-2
          "


          value={form.status}


          onChange={
            e=>
              setForm({
                ...form,
                status:e.target.value
              })
          }

        >

          <option>
            Đang trống
          </option>


          <option>
            Đã thuê
          </option>


          <option>
            Sắp trống
          </option>


        </select>


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
          disabled:opacity-50
        "

      >

        {
          loading
          ?
          "Đang lưu..."
          :
          "Lưu thay đổi"
        }


      </button>



    </div>

  );

}