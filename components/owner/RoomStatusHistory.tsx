interface Props {

  logs:any[];

}



export default function RoomStatusHistory({

  logs

}:Props){



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
          mb-5
          text-xl
          font-semibold
        "
      >

        Lịch sử trạng thái

      </h2>




      {
        logs.length === 0

        ?

        (

          <p
            className="
              text-gray-500
            "
          >

            Chưa có thay đổi trạng thái.

          </p>

        )


        :


        (

          <div
            className="
              space-y-5
            "
          >


            {
              logs.map(
                (log:any)=>(


                  <div
                    key={log.id}
                    className="
                      border-l-4
                      border-blue-500
                      pl-4
                    "
                  >


                    <p
                      className="
                        font-semibold
                      "
                    >

                      {log.old_status}

                      {" → "}

                      {log.new_status}

                    </p>



                    {
                      log.note &&

                      (

                        <p
                          className="
                            text-sm
                            text-gray-600
                          "
                        >

                          Ghi chú:
                          {" "}
                          {log.note}

                        </p>

                      )

                    }



                    {
                      log.changed_by &&

                      (

                        <p
                          className="
                            text-sm
                            text-gray-500
                          "
                        >

                          Người thay đổi:
                          {" "}
                          {log.changed_by}

                        </p>

                      )

                    }



                    <p
                      className="
                        text-xs
                        text-gray-400
                      "
                    >

                      {
                        new Date(
                          log.changed_at
                        )
                        .toLocaleString(
                          "vi-VN"
                        )
                      }

                    </p>


                  </div>


                )
              )
            }


          </div>

        )

      }


    </div>

  );

}