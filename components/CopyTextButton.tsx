"use client";

import { useState } from "react";

type Props = {
  text: string;
  label?: string;
};

export default function CopyTextButton({ text, label = "Copy" }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();

    const value = String(text ?? "").trim();
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);

      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!String(text ?? "").trim()}
      className="
        inline-flex h-[24px] shrink-0 items-center justify-center
        rounded-full border border-gray-300/70
        bg-white/80 px-2
        text-[11px] font-semibold text-gray-700
        shadow-sm backdrop-blur
        transition active:scale-95
        hover:bg-white
        disabled:cursor-not-allowed disabled:opacity-40
      "
      title={copied ? "Đã copy" : label}
    >
      {copied ? "Đã copy" : "Copy"}
    </button>
  );
}