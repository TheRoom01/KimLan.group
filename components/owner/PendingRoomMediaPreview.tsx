"use client";

import { useEffect,useMemo,useState } from "react";
import { GripVertical,Trash2 } from "lucide-react";

export default function PendingRoomMediaPreview({files,setFiles,disabled=false}:{files:File[];setFiles:(updater:(files:File[])=>File[])=>void;disabled?:boolean}){
 const[dragged,setDragged]=useState<number|null>(null);
 const previews=useMemo(()=>files.map(file=>({file,url:URL.createObjectURL(file)})),[files]);
 useEffect(()=>()=>previews.forEach(item=>URL.revokeObjectURL(item.url)),[previews]);
 function drop(target:number){if(dragged===null||dragged===target)return;setFiles(items=>{const next=[...items];const[moved]=next.splice(dragged,1);next.splice(target,0,moved);return next});setDragged(null)}
 if(!files.length)return null;
 return <div className="mt-4"><p className="mb-2 text-sm font-semibold">Preview media mới — kéo thả để đổi thứ tự</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{previews.map(({file,url},index)=><article key={`${file.name}-${file.lastModified}-${file.size}-${index}`} draggable={!disabled} onDragStart={()=>setDragged(index)} onDragOver={e=>e.preventDefault()} onDrop={()=>drop(index)} className="relative overflow-hidden rounded-xl border border-[#aa825d]/30 bg-white shadow-sm">
   {file.type.startsWith("video/")?<video src={url} controls preload="metadata" className="h-32 w-full object-cover"/>:<img src={url} alt={file.name} className="h-32 w-full object-cover"/>}
   <div className="flex items-center gap-1 p-2"><GripVertical size={16} className="shrink-0 text-[#956b45]"/><span className="min-w-0 flex-1 truncate text-xs">{file.name}</span><button type="button" disabled={disabled} onClick={()=>setFiles(items=>items.filter(item=>item!==file))} className="text-red-700" aria-label={`Xóa ${file.name}`}><Trash2 size={16}/></button></div>
  </article>)}</div></div>
}
