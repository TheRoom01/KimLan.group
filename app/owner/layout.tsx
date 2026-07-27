import { ReactNode } from "react";

import OwnerLayout from "@/components/owner/OwnerLayout";
import OwnerLoginGate from "@/components/owner/OwnerLoginGate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function Layout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  /**
   * Không render các Server Component bên trong /owner khi chưa đăng nhập.
   * Việc này tránh getOwnerDashboard(), getOwnerRooms()... chạy trước
   * khi modal đăng nhập xuất hiện.
   */
  if (!user) {
    return <OwnerLoginGate />;
  }

  return <OwnerLayout>{children}</OwnerLayout>;
}