"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Pause, Play } from "lucide-react";

type RoomMediaVideoProps = {
  src: string;
  active: boolean;
  swipeEnabled?: boolean;
  fullscreen?: boolean;
  className?: string;
  onPlaybackChange?: (playing: boolean) => void;
};

const RoomMediaVideo = forwardRef<HTMLVideoElement, RoomMediaVideoProps>(
  function RoomMediaVideo(
    {
      src,
      active,
      swipeEnabled = false,
      fullscreen = false,
      className = "h-full w-full object-contain",
      onPlaybackChange,
    },
    forwardedRef,
  ) {
    const videoRef = useRef<HTMLVideoElement | null>(null);

    const playPendingRef = useRef(false);
    const timerRef = useRef<number | null>(null);

    const [playing, setPlaying] = useState(false);
    const [controlsVisible, setControlsVisible] = useState(true);

    useImperativeHandle(
      forwardedRef,
      () => videoRef.current as HTMLVideoElement,
      [],
    );

    const clearTimer = useCallback(() => {
      if (timerRef.current === null) return;

      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }, []);

    /**
     * Ẩn custom controls sau 1 giây.
     */
    const scheduleControlsHide = useCallback(() => {
      clearTimer();

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setControlsVisible(false);
      }, 1000);
    }, [clearTimer]);

    /**
     * Hiện Play/Pause + Fullscreen.
     *
     * Nếu video đang chạy thì tự ẩn lại sau 1 giây.
     */
    const revealControls = useCallback(() => {
      clearTimer();
      setControlsVisible(true);

      const video = videoRef.current;

      if (video && !video.paused && !video.ended) {
        scheduleControlsHide();
      }
    }, [clearTimer, scheduleControlsHide]);

    const handlePlaybackState = useCallback((nextPlaying: boolean) => {
      clearTimer();

      setPlaying(nextPlaying);
      setControlsVisible(true);

      onPlaybackChange?.(nextPlaying);

      /**
       * Quan trọng:
       * Không kiểm tra state `playing` ở đây vì setPlaying()
       * chưa cập nhật đồng bộ.
       *
       * Dùng trực tiếp nextPlaying để tránh lỗi nút không tự ẩn.
       */
      if (nextPlaying) {
        scheduleControlsHide();
      }
    }, [clearTimer, onPlaybackChange, scheduleControlsHide]);

    useEffect(() => {
      const video = videoRef.current;

      clearTimer();
      playPendingRef.current = false;

      setPlaying(false);
      setControlsVisible(true);

      if (video && !active) {
        video.pause();
      }
    }, [active, clearTimer, src]);

    useEffect(() => {
      return () => {
        clearTimer();
      };
    }, [clearTimer]);

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
        if (
          !(
            error instanceof DOMException &&
            error.name === "AbortError"
          )
        ) {
          console.error("Không thể phát video phòng", error);
        }
      } finally {
        playPendingRef.current = false;

        /**
         * onPlay / onPause vẫn là nguồn chính cập nhật state.
         * Đoạn này chỉ đồng bộ dự phòng.
         */
        setPlaying(!video.paused && !video.ended);
      }
    }

    return (
      <div
        className="relative h-full w-full overflow-hidden bg-black"
        onClick={() => {
          if (!active) return;

          /**
           * Tap màn hình:
           * - controls đang ẩn -> hiện lại
           * - video đang chạy -> sau 1s tự ẩn tiếp
           */
          if (!controlsVisible) {
            revealControls();
          }
        }}
      >
        <video
          ref={videoRef}
          src={src}
          controls={active}
          controlsList="nofullscreen"
          playsInline
          preload="metadata"
          draggable={false}
          data-swipe-ignore={active ? "true" : undefined}
          className={`room-media-video ${className} select-none ${
            active ? "" : "pointer-events-none"
          }`}
          onPlay={() => handlePlaybackState(true)}
          onPause={() => handlePlaybackState(false)}
          onEnded={() => handlePlaybackState(false)}
        />

        {/* Swipe layer */}
        {active && swipeEnabled ? (
          <div
            aria-hidden="true"
            className={`pointer-events-auto absolute inset-x-0 top-0 bottom-14 z-10 cursor-grab select-none active:cursor-grabbing ${
              fullscreen ? "touch-none" : "touch-pan-y"
            }`}
            onClick={(event) => {
              /**
               * Layer swipe nằm trên video nên phải tự xử lý tap.
               */
              event.stopPropagation();

              if (!controlsVisible) {
                revealControls();
              }
            }}
          />
        ) : null}

        {/* Play / Pause giữa màn hình */}
        {active && controlsVisible ? (
          <button
            type="button"
            data-swipe-ignore="true"
            aria-label={playing ? "Dừng video" : "Phát video"}
            title={playing ? "Dừng video" : "Phát video"}
            onClick={(event) => {
              event.stopPropagation();
              void togglePlayback();
            }}
            className="absolute left-1/2 top-1/2 z-40 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/45 bg-black/45 text-white shadow-[0_12px_35px_rgba(0,0,0,0.45)] backdrop-blur-md transition hover:scale-105 hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {playing ? (
              <Pause size={26} fill="currentColor" />
            ) : (
              <Play size={28} fill="currentColor" className="translate-x-0.5" />
            )}
          </button>
        ) : null}

      </div>
    );
  },
);

export default RoomMediaVideo;
