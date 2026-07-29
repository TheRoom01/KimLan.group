"use client";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readApiResponse } from "@/lib/api/client";
import { ROOM_STATUSES, normalizeRoomStatus, type RoomStatus } from "@/lib/owner/types";
const STYLE:Record<RoomStatus,string>={"Đã thuê":"border-red-200 bg-red-100 text-red-800","Đang trống":"border-green-200 bg-green-100 text-green-800","Sắp trống":"border-yellow-200 bg-yellow-100 text-yellow-800"};
export default function RoomStatusControl({roomId,currentStatus}:{roomId:string;currentStatus:string|null}){
 const router=useRouter(),normalized=normalizeRoomStatus(currentStatus)??"Đang trống";const[status,setStatus]=useState<RoomStatus>(normalized),[saved,setSaved]=useState<RoomStatus>(normalized),[open,setOpen]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{setStatus(normalized);setSaved(normalized);},[normalized]);useEffect(()=>{const close=(e:MouseEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false)};document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close)},[]);
 async function update(next:RoomStatus){setStatus(next);setOpen(false);setLoading(true);setError(null);try{await readApiResponse(await fetch(`/api/owner/rooms/${roomId}/status`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:next})}));setSaved(next);router.refresh()}catch(e){setStatus(saved);setError(e instanceof Error?e.message:"Đổi trạng thái phòng thất bại")}finally{setLoading(false)}}
 return <div ref={root} className="relative inline-block"><button type="button" onClick={()=>!loading&&setOpen(v=>!v)} disabled={loading} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold shadow-sm ${STYLE[status]} disabled:opacity-60`}>{loading?<Loader2 size={13} className="animate-spin"/>:<Check size={13}/>} {status}<ChevronDown size={13}/></button>{open?<div className="absolute left-0 top-10 z-30 min-w-36 space-y-1 rounded-xl border border-[#956b45]/20 bg-white p-1.5 shadow-xl">{ROOM_STATUSES.filter(item=>item!==status).map(item=><button key={item} type="button" onClick={()=>void update(item)} className={`block w-full rounded-lg border px-3 py-2 text-left text-xs font-bold ${STYLE[item]}`}>{item}</button>)}</div>:null}{error?<p className="mt-2 w-56 text-xs text-red-700">{error}</p>:null}</div>;
}
