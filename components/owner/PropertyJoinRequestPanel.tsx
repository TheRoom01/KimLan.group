"use client";

import { useEffect, useState } from "react";
import { Check, Clock, Loader2, X } from "lucide-react";

import { readApiResponse } from "@/lib/api/client";


type JoinRequest = {
  id: string;

  requested_role: string;

  message?: string | null;

  requester: {
    full_name?: string | null;
    email?: string | null;
  };

  property: {
    display_address?: string | null;
  };
};



export default function PropertyJoinRequestPanel() {


  const [
    requests,
    setRequests,
  ] = useState<JoinRequest[]>([]);


  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    processingId,
    setProcessingId,
  ] = useState<string | null>(null);

  const [targetRequestId, setTargetRequestId] = useState<string | null>(null);



  async function loadRequests() {

    try {

      const response =
        await fetch(
          "/api/owner/property-join-requests",
          {
            cache: "no-store",
          },
        );


      const result =
        await readApiResponse<{
          requests: JoinRequest[];
        }>(response);


      setRequests(
        result.requests ?? [],
      );


    } catch(error){

      console.error(
        "[PropertyJoinRequest]",
        error,
      );

    }
    finally {

      setLoading(false);

    }

  }



  useEffect(() => {

    void loadRequests();

  }, []);

  useEffect(() => {
    if (loading || requests.length === 0) return;
    const requestId = new URLSearchParams(window.location.search).get("request");
    if (!requestId) return;
    setTargetRequestId(requestId);
    document.getElementById(`property-join-request-${requestId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [loading, requests]);




  async function handleAction(
    requestId:string,
    action:"approve"|"reject",
  ){

    setProcessingId(requestId);


    try {


      const response =
        await fetch(
          "/api/owner/property-join-requests/action",
          {
            method:"POST",

            headers:{
              "Content-Type":"application/json",
            },

            body:JSON.stringify({

              request_id:requestId,

              action,

            }),

          },
        );



      await readApiResponse(response);



      await loadRequests();



    } catch(error){

      console.error(
        "[PropertyJoinRequest action]",
        error,
      );

      alert(
        error instanceof Error
          ? error.message
          : "Không thể xử lý yêu cầu",
      );

    }
    finally {

      setProcessingId(null);

    }

  }




  if (
    loading ||
    requests.length === 0
  ) {

    return null;

  }



  return (

    <section
      className="
      rounded-2xl
      border
      border-[#956b45]/25
      bg-[#fff9ef]
      p-5
      shadow-sm
      "
    >

      <div className="flex items-center gap-2">

        <Clock
          size={20}
          className="text-[#744722]"
        />


        <h2
          className="
          font-bold
          text-[#4d3422]
          "
        >
          Yêu cầu đồng sở hữu
        </h2>

      </div>



      <div className="mt-4 space-y-3">


        {requests.map((request)=>(


          <article
            key={request.id}
            id={`property-join-request-${request.id}`}
            className={`
            rounded-xl
            border
            border-[#aa825d]/20
            bg-[#f8ead7]
            p-4
            scroll-mt-24
            ${targetRequestId === request.id ? "ring-2 ring-[#744722]" : ""}
            `}
          >


            <p className="font-semibold text-[#4d3422]">

              {request.property.display_address}

            </p>



            <p className="mt-2 text-sm text-[#80634a]">

              Người yêu cầu:

              {" "}

              <strong>

                {
                  request.requester.full_name ??
                  request.requester.email ??
                  "Không xác định"
                }

              </strong>

            </p>



            <p className="mt-1 text-sm text-[#80634a]">

              Quyền yêu cầu:

              {" "}
              {request.requested_role === "manager" ? "Quản lý" : "Chủ nhà"}

            </p>



            {
              request.message
              ? (
                <p
                  className="
                  mt-2
                  text-xs
                  text-[#8a6b50]
                  "
                >
                  &ldquo;{request.message}&rdquo;
                </p>
              )
              : null
            }




            <div className="mt-4 grid grid-cols-2 gap-2">


              <button

                disabled={
                  processingId === request.id
                }

                onClick={()=>handleAction(
                  request.id,
                  "reject",
                )}

                className="
                inline-flex
                h-10
                items-center
                justify-center
                gap-2
                rounded-xl
                border
                border-red-200
                bg-red-50
                text-sm
                font-semibold
                text-red-700
                disabled:opacity-50
                "

              >

                {
                  processingId===request.id
                  ?
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />
                  :
                  <X size={16}/>
                }

                Từ chối


              </button>



              <button

                disabled={
                  processingId === request.id
                }

                onClick={()=>handleAction(
                  request.id,
                  "approve",
                )}

                className="
                inline-flex
                h-10
                items-center
                justify-center
                gap-2
                rounded-xl
                bg-[#744722]
                text-sm
                font-semibold
                text-white
                disabled:opacity-50
                "

              >

                {
                  processingId===request.id
                  ?
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />
                  :
                  <Check size={16}/>
                }


                Chấp nhận


              </button>



            </div>



          </article>


        ))}


      </div>


    </section>

  );

}
