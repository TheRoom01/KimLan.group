interface RoomMediaGalleryProps {

  media:any[];

}



export default function RoomMediaGallery({
  media
}:RoomMediaGalleryProps){


  if(!media || media.length === 0){

    return (

      <div
        className="
          rounded-xl
          border
          bg-white
          p-6
          text-gray-500
        "
      >

        Chưa có hình ảnh hoặc video phòng.

      </div>

    );

  }



  return (

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
          mb-4
          text-xl
          font-semibold
        "
      >

        Hình ảnh / Video phòng

      </h2>




      <div
        className="
          grid
          grid-cols-1
          gap-4
          sm:grid-cols-2
          lg:grid-cols-3
        "
      >


        {
          media.map(
            (item:any)=>(


              <div
                key={item.id}
                className="
                  overflow-hidden
                  rounded-lg
                  border
                  bg-gray-50
                "
              >


                {
                  item.type === "video"

                  ?


                  (

                    <video

                      src={item.url}

                      controls

                      className="
                        h-48
                        w-full
                        object-cover
                      "

                    />

                  )


                  :


                  (

                    <img

                      src={item.url}

                      alt="Room media"

                      className="
                        h-48
                        w-full
                        object-cover
                      "

                    />

                  )


                }



                {
                  item.is_cover &&

                  (

                    <div
                      className="
                        px-3
                        py-2
                        text-xs
                        font-medium
                        text-blue-600
                      "
                    >

                      Ảnh đại diện

                    </div>

                  )

                }



              </div>


            )

          )

        }


      </div>


    </div>

  );

}