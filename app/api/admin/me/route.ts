import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const { data: levelData, error: levelError } = await supabase.rpc(
    "get_my_admin_level",
  );
  const rawLevel =
    typeof levelData === "number"
      ? levelData
      : Number(
          (levelData as { level?: number } | null)?.level ??
            (Array.isArray(levelData) ? levelData[0]?.level : 0),
        );

  if (levelError || (rawLevel !== 1 && rawLevel !== 2)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("admin_users")
    .select("phone, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "ADMIN_PROFILE_UNAVAILABLE" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    phone: String(data?.phone ?? "").trim() || null,
    full_name: String(data?.full_name ?? "").trim() || null,
  });
}
