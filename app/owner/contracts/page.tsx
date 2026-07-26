import Link from "next/link";


import {
 getOwnerContracts
} from "@/lib/owner/getOwnerContracts";



export default async function ContractsPage(){


const contracts =
await getOwnerContracts();



return (

<div
className="
space-y-8
"
>


<h1
className="
text-3xl
font-bold
"
>

Hợp đồng

</h1>




<div
className="
grid
gap-5
"
>


{
contracts.length===0

?

<div
className="
rounded-xl
border
bg-white
p-6
text-gray-500
"
>

Chưa có hợp đồng.

</div>


:

contracts.map(
(contract:any)=>(


<div

key={contract.id}

className="
rounded-xl
border
bg-white
p-6
"

>


<h2
className="
text-xl
font-semibold
"
>

{contract.tenant?.full_name}

</h2>



<p>
Tòa nhà:
{" "}
{contract.property?.name}
</p>


<p>
Phòng:
{" "}
{contract.room?.room_code}
</p>


<p>
Giá thuê:
{" "}
{
contract.monthly_price
?.toLocaleString(
"vi-VN"
)
}
đ
</p>


<p>
Trạng thái:
{" "}
{contract.status}
</p>



<Link

href={`/owner/contracts/${contract.id}`}

className="
mt-4
inline-block
rounded-lg
border
px-4
py-2
"

>

Xem chi tiết

</Link>


</div>


)

)

}


</div>


</div>

);

}