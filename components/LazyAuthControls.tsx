"use client";

import dynamic from "next/dynamic";

const AuthControls = dynamic(() => import("@/components/AuthControls"), {
  ssr: false,
});

export default function LazyAuthControls() {
  return <AuthControls />;
}
