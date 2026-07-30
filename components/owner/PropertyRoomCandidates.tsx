"use client";

import { useCallback, useEffect, useState } from "react";
import { ImageIcon, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { readApiResponse } from "@/lib/api/client";

type Candidate = { id: string; room_code?: string | null; price?: number | null; house_number?: string | null; address?: string | null; ward?: string | null; district?: string | null; cover_image?: string | null };

export default function PropertyRoomCandidates({ propertyId, isOwner }: { propertyId: string; isOwner: boolean }) {
  const router = useRouter();
  const [rooms, setRooms] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(isOwner);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isOwner) return;
    try {
      const result = await readApiResponse<{ candidates?: Candidate[] }>(await fetch(`/api/owner/properties/${propertyId}/room-candidates`, { cache: "no-store" }));
      setRooms(result.candidates ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không thể tải phòng gợi ý");
    } finally { setLoading(false); }
  }, [isOwner, propertyId]);

  useEffect(() => { void load(); }, [load]);

  async function assign(roomId: string) {
    setAssigning(roomId); setError(null);
    try {
      await readApiResponse(await fetch(`/api/owner/properties/${propertyId}/room-candidates`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room_id: roomId }),
      }));
      setRooms((current) => current.filter((room) => room.id !== roomId));
      router.refresh();
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Không thể gán phòng");
    } finally { setAssigning(null); }
  }

  if (!isOwner || (!loading && rooms.length === 0 && !error)) return null;
  return <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-5 shadow-sm">
    <h2 className="text-xl font-bold text-[#432918]">Phòng cùng địa chỉ đang chờ xác nhận</h2>
    <p className="mt-1 text-sm text-[#80634a]">Các phòng này có cùng số nhà, tên đường và quận. Chỉ gán khi bạn xác nhận đúng tòa nhà.</p>
    {loading ? <div className="mt-4 flex items-center gap-2 text-sm text-[#80634a]"><Loader2 className="animate-spin" size={16} />Đang tìm phòng...</div> : null}
    {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rooms.map((room) => <article key={room.id} className="overflow-hidden rounded-2xl border border-[#aa825d]/25 bg-[#f8ead7]">
      {room.cover_image ? <div className="relative h-36 w-full"><Image src={room.cover_image} alt={room.room_code || "Ảnh phòng"} fill unoptimized className="object-cover" /></div> : <div className="grid h-36 place-items-center bg-[#ead8bf] text-[#8a6547]"><ImageIcon /></div>}
      <div className="p-4"><p className="font-bold text-[#4d3422]">{room.room_code || "Chưa có mã phòng"}</p><p className="mt-1 text-xs leading-5 text-[#80634a]">{[room.house_number, room.address, room.ward, room.district].filter(Boolean).join(", ")}</p><p className="mt-2 text-sm font-semibold text-[#744722]">{room.price != null ? `${Number(room.price).toLocaleString("vi-VN")}đ` : "Chưa cập nhật giá"}</p><button type="button" disabled={assigning === room.id} onClick={() => void assign(room.id)} className="mt-3 h-10 w-full rounded-xl bg-[#744722] text-sm font-bold text-white disabled:opacity-60">{assigning === room.id ? "Đang gán..." : "Xác nhận phòng thuộc tòa nhà"}</button></div>
    </article>)}</div>
  </section>;
}
