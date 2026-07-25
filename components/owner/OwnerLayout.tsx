"use client";

import { ReactNode } from "react";
import OwnerSidebar from "./OwnerSidebar";

export default function OwnerLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-gray-100">
      <OwnerSidebar />

      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}