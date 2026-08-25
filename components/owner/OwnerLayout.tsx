import type { ReactNode } from "react";

import OwnerSidebar from "./OwnerSidebar";
import OwnerPlaceholderHints from "./OwnerPlaceholderHints";
import OwnerExperience from "./OwnerExperience";

export default function OwnerLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      className="owner-shell
        min-h-screen
        overflow-x-hidden
        bg-[#f4eadc]
        text-[#3f2a1b]
      "
    >
      <OwnerPlaceholderHints />
      <OwnerSidebar />
      <OwnerExperience />

      <main
        className="
          mx-auto
          min-w-0
          w-full
          max-w-[1440px]
          overflow-x-clip
          px-4
          pb-28
          pt-4
          sm:px-6
          sm:pt-6
          lg:px-8
          lg:pb-10
          lg:pt-8
        "
      >
        {children}
      </main>
    </div>
  );
}
