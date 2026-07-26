"use client";


import {
  useState
} from "react";


import {
  useRouter
} from "next/navigation";



export default function RoomStatusControl({

  roomId,

  currentStatus

}:{

  roomId:string;

  currentStatus:string;

}){


  const router =
    useRouter();


  const [status,setStatus]
    =
    useState(currentStatus);



  const [loading,setLoading]
    =
    useState(false);



  async function updateStatus(){


    setLoading(true);


    await fetch(

      `/api/owner/rooms/${roomId}/status`,

      {

        method:"PATCH",

        headers:{

          "Content-Type":
          "application/json"

        },

        body:JSON.stringify({

          status

        })

      }

    );


    router.refresh();


    setLoading(false);

  }



  return (

    <div
      className="
        flex
        gap-3
        items-center
      "
    >

      <select

        value={status}

        onChange={
          e=>setStatus(e.target.value)
        }

        className="
          rounded-lg
          border
          px-3
          py-2
        "

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



      <button

        onClick={updateStatus}

        disabled={loading}

        className="
          rounded-lg
          bg-blue-600
          px-4
          py-2
          text-white
        "

      >

        {loading
          ?
          "Lưu..."
          :
          "Đổi trạng thái"
        }

      </button>


    </div>

  );

}