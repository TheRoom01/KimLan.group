"use client";

import { ReactNode } from "react";
import OwnerSidebar from "./OwnerSidebar";

export default function OwnerLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f4eadc] text-[#3f2a1b]">
      <OwnerSidebar />

      <main className="mx-auto w-full max-w-[1600px] px-3 pb-28 pt-4 sm:px-5 sm:pt-6 lg:px-8 lg:pb-10 lg:pt-8">
        {children}
      </main>
    </div>
  );
}
