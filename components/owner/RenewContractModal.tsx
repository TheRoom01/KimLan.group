"use client";


import {
 useState
} from "react";


import {
 useRouter
} from "next/navigation";



export default function RenewContractModal({

contractId,

currentPrice

}:{

contractId:string;

currentPrice:number;

}){


const router =
useRouter();


const today =
new Date()
.toISOString()
.slice(0,10);



const nextYear =
new Date();


nextYear.setFullYear(
nextYear.getFullYear()+1
);



const [open,setOpen]
=
useState(false);



const [form,setForm]
=
useState({

start_date:today,

end_date:
nextYear
.toISOString()
.slice(0,10),

monthly_price:
currentPrice

});



const [loading,setLoading]
=
useState(false);



async function submit(){


setLoading(true);


try{


const res =
await fetch(

`/api/owner/contracts/${contractId}/renew`,

{

method:"POST",

headers:{

"Content-Type":
"application/json"

},

body:
JSON.stringify(form)

}

);



if(!res.ok)
throw new Error();



setOpen(false);


router.refresh();


}

catch{

alert(
"Gia hạn hợp đồng thất bại"
);

}

finally{

setLoading(false);

}


}



return (

<>


<button

onClick={()=>setOpen(true)}

className="
rounded-lg
bg-blue-600
px-4
py-2
text-white
"

>

Gia hạn hợp đồng

</button>



{
open && (

<div
className="
fixed
inset-0
flex
items-center
justify-center
bg-black/40
"
>


<div
className="
w-full
max-w-md
rounded-xl
bg-white
p-6
space-y-4
"
>


<h2
className="
text-xl
font-semibold
"
>

Gia hạn hợp đồng

</h2>



<div>

<label>
Giá thuê mới
</label>


<input

type="number"

className="
w-full
rounded border
p-2
"

value={form.monthly_price}

onChange={
e=>
setForm({

...form,

monthly_price:
Number(e.target.value)

})
}

/>

</div>




<div>

<label>
Ngày bắt đầu
</label>


<input

type="date"

className="
w-full
rounded border
p-2
"

value={form.start_date}

onChange={
e=>
setForm({

...form,

start_date:
e.target.value

})
}

/>

</div>




<div>

<label>
Ngày kết thúc
</label>


<input

type="date"

className="
w-full
rounded border
p-2
"

value={form.end_date}

onChange={
e=>
setForm({

...form,

end_date:
e.target.value

})
}

/>

</div>




<div
className="
flex
justify-end
gap-3
"
>


<button

onClick={()=>setOpen(false)}

className="
rounded border
px-4
py-2
"

>

Hủy

</button>



<button

disabled={loading}

onClick={submit}

className="
rounded bg-blue-600 px-4 py-2 text-white
"

>

{
loading
?
"Đang lưu..."
:
"Xác nhận"
}

</button>


</div>


</div>


</div>

)

}


</>

);

}   