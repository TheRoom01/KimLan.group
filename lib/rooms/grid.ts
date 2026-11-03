import type { CSSProperties } from "react";

// Home's grid fallback; the recommendation rail matches its actual card width.
export const ROOM_GRID_STYLE: CSSProperties = {
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 360px), 440px))",
  justifyContent: "center",
  alignItems: "start",
  gap: "clamp(14px, 1.2vw, 22px)",
};
