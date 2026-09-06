"use client";

import { useEffect, useRef } from "react";
import { trackVisitorEvent } from "./client";

export function useRoomView(roomId?: string) {
  const lastRoom = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!roomId || lastRoom.current === roomId) return;
    lastRoom.current = roomId;
    // Room openings only affect room metrics, never Home page views.
    // Ref survives effect replay (StrictMode), unlike a time-based throttle.
    trackVisitorEvent("room_view", roomId, crypto.randomUUID());
  }, [roomId]);
}
