import Link from "next/link";


import {
  getTenantDetail
} from "@/lib/owner/getTenantDetail";



export default async function TenantDetailPage({

params

}:{

params:Promise<{
 id:string
}>

}){


const {
 id
}=await params;



const data =
await getTenantDetail(id);



if(!data){


return (

<div
className="
rounded-xl
border
bg-white
p-6
"
>

Không tìm thấy khách thuê.

</div>

);


}


const tenant =
data.tenant;
if (!tenant) {

  return (

    <div
      className="
        rounded-xl
        border
        bg-white
        p-6
      "
    >

      Không tìm thấy thông tin khách thuê.

    </div>

  );

}

const activeContract =
  data.activeContract;


const room =
  activeContract?.room;


const property =
  activeContract?.property;


const contracts =
  data.contracts ?? [];


return (

<div
className="
space-y-8
"
>


<div
className="
flex
items-center
justify-between
"
>


<div>

<h1
className="
text-3xl
font-bold
"
>

{tenant.full_name}

</h1>


<p
className="
text-gray-500
"
>

Khách thuê

</p>

</div>



<Link

href="/owner/tenants"

className="
rounded-lg
border
px-4
py-2
"

>

← Danh sách khách thuê

</Link>


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
mb-4
text-xl
font-semibold
"
>

Thông tin cá nhân

</h2>


<div
className="
space-y-2
"
>

<p>
<strong>Họ tên:</strong>{" "}
{tenant.full_name}
</p>

<p>
<strong>SĐT:</strong>{" "}
{tenant.phone}
</p>


<p>
<strong>CCCD:</strong>{" "}
{tenant.cccd ?? "-"}
</p>


<p>
<strong>Ngày sinh:</strong>{" "}
{
tenant.date_of_birth ?? "-"
}
</p>


<p>
<strong>Địa chỉ:</strong>{" "}
{
tenant.address ?? "-"
}
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
mb-4
text-xl
font-semibold
"
>

Đang thuê

</h2>


{
activeContract ? (

<>

<p>
<strong>Tòa nhà:</strong>{" "}
{
  activeContract?.property?.name
  ??
  activeContract?.property?.address
  ??
  "-"
}
</p>


<p>
<strong>Phòng:</strong>{" "}
{room?.room_code ?? "-"}
</p>


<p>
<strong>Giá thuê:</strong>{" "}
{
activeContract.monthly_price
?.toLocaleString(
"vi-VN"
)
}
đ
</p>

</>

) : (

<p>
Hiện chưa có hợp đồng đang hiệu lực.
</p>

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
mb-4
text-xl
font-semibold
"
>

Lịch sử hợp đồng

</h2>


{
contracts.length === 0 ? (

<p>
Chưa có hợp đồng.
</p>

) : (

<div
className="
space-y-4
"
>

{
contracts.map(
(contract:any)=> (

<div
key={contract.id}
className="
rounded-lg
border
p-4
"
>


<p>
<strong>Bắt đầu:</strong>{" "}
{
contract.start_date
?
new Date(
contract.start_date
)
.toLocaleDateString(
"vi-VN"
)
:
"-"
}
</p>


<p>
<strong>Kết thúc:</strong>{" "}
{
contract.end_date
?
new Date(
contract.end_date
)
.toLocaleDateString(
"vi-VN"
)
:
"-"
}
</p>


<p>
<strong>Tiền cọc:</strong>{" "}
{
contract.deposit_amount
?.toLocaleString(
"vi-VN"
)
}
đ
</p>


<p>
<strong>Trạng thái:</strong>{" "}
{contract.status}
</p>


<p>
<strong>Phòng:</strong>{" "}
{contract.room?.room_code ?? "-"}
</p>


<p>
<strong>Tòa nhà:</strong>{" "}
{contract.property?.name ?? "-"}
</p>


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