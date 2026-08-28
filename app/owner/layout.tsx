import { ReactNode } from "react";

import OwnerLayout from "@/components/owner/OwnerLayout";
import OwnerLoginGate from "@/components/owner/OwnerLoginGate";
import OwnerPlaceholderHints from "@/components/owner/OwnerPlaceholderHints";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";

export default async function Layout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();

  /**
   * Không render các Server Component bên trong /owner khi chưa đăng nhập.
   * Việc này tránh getOwnerDashboard(), getOwnerRooms()... chạy trước
   * khi modal đăng nhập xuất hiện.
   */
  if (!user) {
    return <><OwnerPlaceholderHints /><OwnerLoginGate /></>;
  }

  return <OwnerLayout>{children}</OwnerLayout>;
}
