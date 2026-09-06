"use client";

import { useState } from "react";
import { ROOM_STATUSES } from "@/lib/owner/types";
import { roomStatusLabel } from "@/lib/rooms/availability";
import { requestAvailabilityDate } from "./requestAvailabilityDate";

export default function RoomStatusField({ initialStatus, initialDate, className }: {
  initialStatus?: string | null; initialDate?: string | null; className?: string;
}) {
  const [status, setStatus] = useState(initialStatus ?? "Đang trống");
  const [date, setDate] = useState(initialDate ?? "");
  async function choose(next: string) {
    const chosen = next === "Sắp trống" ? await requestAvailabilityDate(date) : "";
    if (chosen === null) return;
    setStatus(next);
    setDate(chosen);
  }
  return <>
    <select id="status" name="status" className={className} value={status} onChange={(e) => void choose(e.target.value)}>
      {ROOM_STATUSES.map((item) => <option key={item} value={item}>{roomStatusLabel(item, item === status ? date : null)}</option>)}
    </select>
    <input type="hidden" name="available_from" value={status === "Sắp trống" ? date : ""} />
    {status === "Sắp trống" ? <button type="button" onClick={() => void choose(status)} className="mt-2 text-sm font-semibold underline">{date ? "Đổi ngày trống" : "Chọn ngày trống"}</button> : null}
  </>;
}
