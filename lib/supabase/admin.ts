import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export function createSupabaseAdminClient(audit?: {
  source: "admin_api" | "owner_portal" | "zalo_import" | "zalo_automation";
  actorUserId?: string;
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRole) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceRole, {
    ...(audit && {
      global: {
        headers: {
          "x-room-audit-source": audit.source,
          "x-room-audit-operation": randomUUID(),
          ...(audit.actorUserId && { "x-room-audit-actor": audit.actorUserId }),
        },
      },
    }),
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
