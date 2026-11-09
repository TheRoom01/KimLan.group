import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ANONYMOUS_HOME_COOKIE,
  ANONYMOUS_HOME_LIMIT_MS,
  verifyAnonymousHomeSessionToken,
} from "@/lib/anonymousHomeSessionToken";

export type AnonymousHomeAccess = {
  sessionId: string;
  startedAt: string;
  expiresAt: string;
  expired: boolean;
};

export const getAnonymousHomeAccess = cache(async (): Promise<AnonymousHomeAccess | null> => {
  const cookieStore = await cookies();
  const token = await verifyAnonymousHomeSessionToken(cookieStore.get(ANONYMOUS_HOME_COOKIE)?.value);
  if (!token) return null;

  const admin = createSupabaseAdminClient();
  const { data: initialRow, error } = await admin
    .from("anon_sessions")
    .select("id,created_at")
    .eq("id", token.id)
    .maybeSingle();

  if (error) throw new Error("Không thể kiểm tra phiên xem phòng");
  let row = initialRow;
  if (!row) {
    const inserted = await admin
      .from("anon_sessions")
      .insert({ id: token.id, created_at: new Date(token.startedAt).toISOString() })
      .select("id,created_at")
      .maybeSingle();
    if (inserted.error && inserted.error.code !== "23505") throw new Error("Không thể khởi tạo phiên xem phòng");
    row = inserted.data;
    if (!row) {
      const existing = await admin.from("anon_sessions").select("id,created_at").eq("id", token.id).maybeSingle();
      if (existing.error || !existing.data) throw new Error("Không thể khởi tạo phiên xem phòng");
      row = existing.data;
    }
  }

  const startedAtMs = new Date(String(row.created_at)).getTime();
  if (!Number.isFinite(startedAtMs)) return null;
  const expiresAtMs = startedAtMs + ANONYMOUS_HOME_LIMIT_MS;
  return {
    sessionId: String(row.id),
    startedAt: new Date(startedAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    expired: Date.now() >= expiresAtMs,
  };
});

export async function requirePublicRoomDataAccess() {
  const viewer = await createSupabaseServerClient();
  const { data: { user }, error } = await viewer.auth.getUser();
  if (!error && user) return { allowed: true as const, authenticated: true as const, viewer, anonymous: null };

  const anonymous = await getAnonymousHomeAccess();
  return {
    allowed: Boolean(anonymous && !anonymous.expired),
    authenticated: false as const,
    viewer,
    anonymous,
  };
}

export const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
} as const;
