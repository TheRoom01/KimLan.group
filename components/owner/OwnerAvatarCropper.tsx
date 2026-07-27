"use client";

import {
  Loader2,
  Minus,
  Plus,
  X,
} from "lucide-react";
import {
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const OUTPUT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

type Point = {
  x: number;
  y: number;
};

type ImageSize = {
  width: number;
  height: number;
};

export default function OwnerAvatarCropper({
  imageUrl,
  saving,
  onCancel,
  onConfirm,
}: {
  imageUrl: string;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => Promise<void> | void;
}) {
  const frameRef =
    useRef<HTMLDivElement | null>(null);

  const imageRef =
    useRef<HTMLImageElement | null>(null);

  const dragStartRef = useRef<{
    pointer: Point;
    offset: Point;
  } | null>(null);

  const [viewportSize, setViewportSize] =
    useState(320);

  const [imageSize, setImageSize] =
    useState<ImageSize>({
      width: 0,
      height: 0,
    });

  const [zoom, setZoom] = useState(1);

  const [offset, setOffset] =
    useState<Point>({
      x: 0,
      y: 0,
    });

  const [processing, setProcessing] =
    useState(false);

  const isBusy = saving || processing;

  useEffect(() => {
    const element = frameRef.current;

    if (!element) {
      return;
    }

    function updateSize() {
      if (!element) return;

      const rect =
        element.getBoundingClientRect();

      if (rect.width > 0) {
        setViewportSize(rect.width);
      }
    }

    updateSize();

    const observer =
      new ResizeObserver(updateSize);

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const baseScale = useMemo(() => {
    if (
      imageSize.width <= 0 ||
      imageSize.height <= 0
    ) {
      return 1;
    }

    return Math.max(
      viewportSize / imageSize.width,
      viewportSize / imageSize.height,
    );
  }, [imageSize, viewportSize]);

  const renderedScale = baseScale * zoom;

  const renderedWidth =
    imageSize.width * renderedScale;

  const renderedHeight =
    imageSize.height * renderedScale;

  function clampOffset(
    candidate: Point,
    scale = renderedScale,
  ): Point {
    const width =
      imageSize.width * scale;

    const height =
      imageSize.height * scale;

    const maxX = Math.max(
      0,
      (width - viewportSize) / 2,
    );

    const maxY = Math.max(
      0,
      (height - viewportSize) / 2,
    );

    return {
      x: Math.min(
        maxX,
        Math.max(-maxX, candidate.x),
      ),
      y: Math.min(
        maxY,
        Math.max(-maxY, candidate.y),
      ),
    };
  }

  function changeZoom(nextZoom: number) {
    const normalizedZoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, nextZoom),
    );

    const nextScale =
      baseScale * normalizedZoom;

    setZoom(normalizedZoom);

    setOffset((current) =>
      clampOffset(current, nextScale),
    );
  }

  function handlePointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (isBusy) return;

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );

    dragStartRef.current = {
      pointer: {
        x: event.clientX,
        y: event.clientY,
      },
      offset,
    };
  }

  function handlePointerMove(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    const dragStart =
      dragStartRef.current;

    if (!dragStart || isBusy) {
      return;
    }

    const candidate = {
      x:
        dragStart.offset.x +
        (event.clientX -
          dragStart.pointer.x),

      y:
        dragStart.offset.y +
        (event.clientY -
          dragStart.pointer.y),
    };

    setOffset(clampOffset(candidate));
  }

  function finishPointer(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    dragStartRef.current = null;

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId,
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId,
      );
    }
  }

  async function createCroppedBlob() {
    const image = imageRef.current;

    if (
      !image ||
      imageSize.width <= 0 ||
      imageSize.height <= 0
    ) {
      throw new Error(
        "Ảnh chưa tải xong",
      );
    }

    const scale = renderedScale;

    const renderedLeft =
      (viewportSize - renderedWidth) / 2 +
      offset.x;

    const renderedTop =
      (viewportSize - renderedHeight) / 2 +
      offset.y;

    const sourceX =
      -renderedLeft / scale;

    const sourceY =
      -renderedTop / scale;

    const sourceSize =
      viewportSize / scale;

    const canvas =
      document.createElement("canvas");

    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;

    const context =
      canvas.getContext("2d");

    if (!context) {
      throw new Error(
        "Trình duyệt không hỗ trợ xử lý ảnh",
      );
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    );

    return new Promise<Blob>(
      (resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(
                new Error(
                  "Không thể tạo ảnh WebP",
                ),
              );

              return;
            }

            resolve(blob);
          },
          "image/webp",
          0.86,
        );
      },
    );
  }

  async function handleConfirm() {
    if (isBusy) return;

    setProcessing(true);

    try {
      const blob =
        await createCroppedBlob();

      await onConfirm(blob);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <section className="w-full max-w-md overflow-hidden rounded-[24px] border border-white/10 bg-[#fff9ef] shadow-[0_30px_100px_rgba(0,0,0,0.45)]">
        <header className="flex items-center justify-between border-b border-[#a9825f]/20 px-5 py-4">
          <div>
            <h2 className="font-bold text-[#432918]">
              Chỉnh sửa ảnh đại diện
            </h2>

            <p className="mt-1 text-xs text-[#82654d]">
              Kéo ảnh để căn chỉnh khuôn mặt
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            aria-label="Đóng"
            className="grid h-10 w-10 place-items-center rounded-xl text-[#76563e] transition hover:bg-[#f0dec6] disabled:opacity-50"
          >
            <X size={19} />
          </button>
        </header>

        <div className="p-5">
          <div
            ref={frameRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointer}
            onPointerCancel={finishPointer}
            className="relative mx-auto aspect-square w-full max-w-[320px] cursor-grab touch-none overflow-hidden rounded-full bg-[#2e2119] active:cursor-grabbing"
          >
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Ảnh đang chỉnh sửa"
              draggable={false}
              onLoad={(event) => {
                setImageSize({
                  width:
                    event.currentTarget.naturalWidth,
                  height:
                    event.currentTarget.naturalHeight,
                });

                setZoom(1);

                setOffset({
                  x: 0,
                  y: 0,
                });
              }}
              className="pointer-events-none absolute max-w-none select-none"
              style={{
                width: `${renderedWidth}px`,
                height: `${renderedHeight}px`,
                left: `${
                  (viewportSize -
                    renderedWidth) /
                    2 +
                  offset.x
                }px`,
                top: `${
                  (viewportSize -
                    renderedHeight) /
                    2 +
                  offset.y
                }px`,
              }}
            />

            <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-inset ring-white/80" />

            <div className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]" />
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Minus
              size={17}
              className="shrink-0 text-[#76563e]"
            />

            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              disabled={isBusy}
              onChange={(event) =>
                changeZoom(
                  Number(event.target.value),
                )
              }
              aria-label="Phóng to ảnh"
              className="min-w-0 flex-1 accent-[#744722]"
            />

            <Plus
              size={17}
              className="shrink-0 text-[#76563e]"
            />
          </div>

          <p className="mt-3 text-center text-xs leading-5 text-[#8b6c53]">
            Ảnh sẽ được lưu ở kích thước
            512 × 512 px, định dạng WebP.
          </p>
        </div>

        <footer className="grid grid-cols-2 gap-3 border-t border-[#a9825f]/20 p-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="h-11 rounded-xl border border-[#9d744f]/30 bg-[#fff9ef] text-sm font-semibold text-[#684324] transition hover:bg-[#f2e1cb] disabled:opacity-50"
          >
            Hủy
          </button>

          <button
            type="button"
            onClick={() =>
              void handleConfirm()
            }
            disabled={
              isBusy ||
              imageSize.width <= 0
            }
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#744722] text-sm font-bold text-[#fff7e9] transition hover:bg-[#623817] disabled:opacity-50"
          >
            {isBusy ? (
              <>
                <Loader2
                  size={17}
                  className="animate-spin"
                />
                Đang lưu...
              </>
            ) : (
              "Lưu ảnh"
            )}
          </button>
        </footer>
      </section>
    </div>
  );
}