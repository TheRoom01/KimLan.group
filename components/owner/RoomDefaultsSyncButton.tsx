"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { readApiResponse } from "@/lib/api/client";

const DETAIL_FIELDS = [
  "electric_fee_value", "electric_fee_unit", "water_fee_value", "water_fee_unit",
  "service_fee_value", "service_fee_unit", "parking_fee_value", "parking_fee_unit",
  "other_fee_value", "other_fee_note", "has_elevator", "has_stairs", "shared_washer",
  "private_washer", "shared_dryer", "private_dryer", "has_parking", "has_basement",
  "fingerprint_lock", "allow_pet", "allow_cat", "allow_dog", "no_pet", "short_term",
  "long_term", "other_amenities",
] as const;

export default function RoomDefaultsSyncButton({propertyId,formId}:{propertyId:string;formId:string}) {
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState<string|null>(null);

  async function sync(){
    setLoading(true);setMessage(null);
    try{
      const result=await readApiResponse<any>(await fetch(`/api/owner/properties/${propertyId}`,{cache:"no-store"}));
      const property=result?.property??result;
      const defaults=property?.default_room_data??{};
      const values:Record<string,unknown>={
        status:defaults.status,zalo_phone:defaults.zalo_phone,link_zalo:defaults.link_zalo,
        chinh_sach:defaults.chinh_sach,house_number:property?.house_number,address:property?.address,
        ward:property?.ward,district:property?.district,
      };
      const details=defaults.room_details??{};
      for(const name of DETAIL_FIELDS) values[name]=details[name];
      const form=document.getElementById(formId) as HTMLFormElement|null;
      if(!form) throw new Error("Không tìm thấy biểu mẫu phòng");
      for(const[name,value]of Object.entries(values)){
        if(value===undefined)continue;
        const field=form.elements.namedItem(name) as HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|null;
        if(!field)continue;
        if(field instanceof HTMLInputElement&&field.type==="checkbox")field.checked=Boolean(value);
        else field.value=value===null?"":String(value);
        field.dispatchEvent(new Event("change",{bubbles:true}));
      }
      setMessage("Đã đồng bộ dữ liệu tòa nhà mới nhất. Hãy kiểm tra và bấm Lưu.");
    }catch(error){setMessage(error instanceof Error?error.message:"Không thể đồng bộ tòa nhà")}finally{setLoading(false)}
  }

  return <div className="flex flex-col items-center gap-1">
    <button type="button" onClick={()=>void sync()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-[#744722] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"><RefreshCw size={16} className={loading?"animate-spin":""}/>{loading?"Đang đồng bộ...":"Đồng bộ thông tin tòa nhà"}</button>
    {message?<span className="max-w-sm text-center text-xs text-[#684324]">{message}</span>:null}
  </div>;
}
