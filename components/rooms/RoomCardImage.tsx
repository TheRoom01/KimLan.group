"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

/** An optimizer failure must not mark a valid source image as missing. */
export default function RoomCardImage({ src, alt, unoptimized, onError, ...props }: ImageProps) {
  const [failedSource, setFailedSource] = useState<ImageProps["src"] | null>(null);
  const direct = Boolean(unoptimized || failedSource === src);
  return <Image {...props} src={src} alt={alt} unoptimized={direct} decoding="async" onError={event => {
    if (!direct) {
      setFailedSource(src);
      return;
    }
    onError?.(event);
  }} />;
}
