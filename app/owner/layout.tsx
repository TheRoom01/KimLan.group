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

  /*
   * A room created by Admin may have been waiting for this owner's phone
   * account to exist. Claim those properties before loading the dashboard so
   * getProperties()/getOwnerRooms() can see them on the first refresh.
   */
  const { error: claimError } = await supabase.rpc(
    "claim_admin_properties_by_phone_v1",
  );

  if (claimError) {
    console.warn("[Owner] property phone claim failed", claimError);
  }

  return <OwnerLayout>{children}</OwnerLayout>;
}
