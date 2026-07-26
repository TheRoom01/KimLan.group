import Link from "next/link";

import RenewContractModal from "@/components/owner/RenewContractModal";
import {
  getContractDetail
} from "@/lib/owner/getContractDetail";

import EndContractButton from "@/components/owner/EndContractButton";

export default async function ContractDetailPage({

params

}:{

params:Promise<{
 id:string
}>

}){


const {
 id
}
=
await params;



const contract =
await getContractDetail(id);



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

Chi tiết hợp đồng

</h1>


<p
className="
text-gray-500
"
>

Hợp đồng thuê phòng

</p>


</div>



<Link

href="/owner/contracts"

className="
rounded-lg
border
px-4
py-2
"

>

← Danh sách hợp đồng

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

Khách thuê

</h2>


<p>
<strong>Họ tên:</strong>{" "}
{contract.tenant?.full_name}
</p>


<p>
<strong>SĐT:</strong>{" "}
{contract.tenant?.phone}
</p>


<p>
<strong>CCCD:</strong>{" "}
{contract.tenant?.cccd ?? "-"}
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

Phòng

</h2>


<p>
<strong>Tòa nhà:</strong>{" "}

{
  contract.property?.name
  ??
  `${contract.property?.house_number ?? ""}
   ${contract.property?.address ?? ""}
   ${contract.property?.district ?? ""}`
}

</p>


<p>
<strong>Phòng:</strong>{" "}
{contract.room?.room_code}
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

Thông tin hợp đồng

</h2>


<div
className="
space-y-2
"
>


<p>

<strong>
Bắt đầu:
</strong>{" "}

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

<strong>
Kết thúc:
</strong>{" "}

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

<strong>
Giá thuê:
</strong>{" "}

{
contract.monthly_price
?.toLocaleString(
"vi-VN"
)

}
đ

</p>



<p>

<strong>
Tiền cọc:
</strong>{" "}

{
contract.deposit_amount
?.toLocaleString(
"vi-VN"
)

}
đ

</p>



<p>

<strong>
Trạng thái:
</strong>{" "}

{contract.status}

</p>

<div
className="
mt-6
flex
gap-3
"
>

{
contract.status !== "Đã hủy" && (

<RenewContractModal

contractId={
contract.id
}

currentPrice={
contract.monthly_price
}

/>

)
}



{
contract.status === "Đang hiệu lực" && (

<EndContractButton

contractId={
contract.id
}

/>

)
}

</div>

</div>


</div>



</div>

);

}