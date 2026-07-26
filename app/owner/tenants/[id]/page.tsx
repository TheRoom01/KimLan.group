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

const contract =
data.contract;


const room =
  data.room;


const property =
  data.property;


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


<p>
<strong>Tòa nhà:</strong>{" "}
{property.name}
</p>


<p>
<strong>Phòng:</strong>{" "}
{room.room_code}
</p>


<p>
<strong>Giá thuê:</strong>{" "}
{
contract.monthly_price
?.toLocaleString(
"vi-VN"
)
}
đ
</p>


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

Hợp đồng

</h2>


<p>
<strong>Bắt đầu:</strong>{" "}
{
new Date(
contract.start_date
)
.toLocaleDateString(
"vi-VN"
)
}
</p>


<p>
<strong>Kết thúc:</strong>{" "}
{
new Date(
contract.end_date
)
.toLocaleDateString(
"vi-VN"
)
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


</div>


</div>

);

}