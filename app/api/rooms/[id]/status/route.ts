import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;

    if (!roomId) {
      return NextResponse.json(
        { error: "Thiếu room id" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    const status = String(body?.status ?? "").trim();

    if (!["Trống", "Đã thuê"].includes(status)) {
      return NextResponse.json(
        { error: "Trạng thái không hợp lệ" },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Chưa đăng nhập" },
        { status: 401 }
      );
    }

    const { data, error } = await supabase.rpc(
      "update_room_status_admin_v1",
      {
        p_room_id: roomId,
        p_status: status,
      }
    );

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "42501" ? 403 : 500 }
      );
    }

    return NextResponse.json({
      data: data?.[0] ?? {
        id: roomId,
        status,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}