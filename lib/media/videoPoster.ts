export function getRoomVideoPosterKey(videoKey: string, roomId?: string) {
  const match = /^rooms\/([a-z\d-]+)\/videos?\/[a-z\d-]+\.[a-z\d]+$/i.exec(videoKey);
  if (!match || (roomId && match[1] !== roomId)) return "";
  return `${videoKey}.poster.webp`;
}

export function getRoomVideoPosterUrl(videoUrl: string, roomId?: string) {
  try {
    const url = new URL(videoUrl);
    const key = getRoomVideoPosterKey(url.pathname.slice(1), roomId);
    if (!key || url.protocol !== "https:" || url.search || url.hash) return "";
    url.pathname = `/${key}`;
    return url.href;
  } catch {
    return "";
  }
}

export async function captureVideoPoster(source: string) {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error("Video frame timed out")), 8000);
      const finish = (error?: Error) => {
        clearTimeout(timer);
        video.onloadeddata = video.onseeked = video.onerror = null;
        if (error) reject(error);
        else resolve();
      };
      video.onerror = () => finish(new Error("Video could not be decoded"));
      video.onseeked = () => finish();
      video.onloadeddata = () => {
        video.onloadeddata = null;
        const position = Math.min(1, video.duration / 4);
        if (position > 0) video.currentTime = position;
        else finish();
      };
      video.src = source;
    });

    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 600 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context || !video.videoWidth || !video.videoHeight) throw new Error("Video has no frame");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.8));
    if (blob?.type !== "image/webp") throw new Error("WebP encoding failed");
    return new File([blob], "poster.webp", { type: blob.type });
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}
