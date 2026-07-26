"use client";


import {
 useRouter
} from "next/navigation";


import {
 useState
} from "react";



export default function EndContractButton({

contractId

}:{

contractId:string;

}){


const router =
useRouter();


const [loading,setLoading]
=
useState(false);



async function endContract(){


const confirmEnd =
confirm(
"Bạn chắc chắn muốn kết thúc hợp đồng?"
);


if(!confirmEnd)
return;



try{


setLoading(true);



const res =
await fetch(
`/api/owner/contracts/${contractId}/end`,
{
method:"POST"
}
);



if(!res.ok){

throw new Error();

}



router.refresh();



}

catch{

alert(
"Kết thúc hợp đồng thất bại"
);

}

finally{

setLoading(false);

}


}



return (

<button

onClick={endContract}

disabled={loading}

className="
rounded-lg
bg-red-600
px-4
py-2
text-white
disabled:opacity-50
"

>

{
loading
?
"Đang xử lý..."
:
"Kết thúc hợp đồng"
}


</button>

);


}