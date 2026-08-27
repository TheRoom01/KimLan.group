"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

type RoomMediaVideoProps = {
  src: string;
  active: boolean;
  swipeEnabled?: boolean;
  fullscreen?: boolean;
  className?: string;
};

const RoomMediaVideo = forwardRef<HTMLVideoElement, RoomMediaVideoProps>(function RoomMediaVideo(
  { src, active, swipeEnabled = false, fullscreen = false, className = "h-full w-full object-contain" },
  forwardedRef,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playPendingRef = useRef(false);
  const [playing, setPlaying] = useState(false);

  useImperativeHandle(forwardedRef, () => videoRef.current as HTMLVideoElement, []);

  useEffect(() => {
    const video = videoRef.current;
    playPendingRef.current = false;
    setPlaying(false);
    if (video && !active) video.pause();
  }, [active, src]);

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video || !active || playPendingRef.current) return;

    if (!video.paused && !video.ended) {
      video.pause();
      return;
    }

    playPendingRef.current = true;
    try {
      await video.play();
    } catch (error) {
      // pause() trong lúc play() còn pending là một trạng thái hợp lệ khi
      // người dùng vuốt hoặc đóng fullscreen, không phải lỗi runtime.
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.error("Không thể phát video phòng", error);
      }
    } finally {
      playPendingRef.current = false;
      setPlaying(!video.paused && !video.ended);
    }
  }

  return (
    <div className="relative h-full w-full">
      <video
        ref={videoRef}
        src={src}
        controls={active}
        playsInline
        preload="metadata"
        draggable={false}
        data-swipe-ignore={active ? "true" : undefined}
        className={`${className} select-none ${active ? "" : "pointer-events-none"}`}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      {active && swipeEnabled ? (
        <div
          aria-hidden="true"
          className={`pointer-events-auto absolute inset-x-0 top-0 bottom-14 z-10 cursor-grab select-none active:cursor-grabbing ${fullscreen ? "touch-none" : "touch-pan-y"}`}
        />
      ) : null}

      {active ? (
        <button
          type="button"
          data-swipe-ignore="true"
          aria-label={playing ? "Tạm dừng video" : "Phát video"}
          title={playing ? "Tạm dừng" : "Phát"}
          onClick={(event) => {
            event.stopPropagation();
            void togglePlayback();
          }}
          className="absolute inset-0 z-20 m-auto grid h-16 w-16 place-items-center rounded-full border border-white/40 bg-black/45 text-white shadow-[0_16px_45px_rgba(0,0,0,0.45)] backdrop-blur transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {playing ? <Pause size={26} fill="currentColor" /> : <Play size={27} fill="currentColor" className="translate-x-0.5" />}
        </button>
      ) : (
        <span className="pointer-events-none absolute inset-0 z-10 grid place-items-center text-white">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-black/55 backdrop-blur">
            <Play size={25} fill="currentColor" className="translate-x-0.5" />
          </span>
        </span>
      )}
    </div>
  );
});

export default RoomMediaVideo;
