import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RoomMutationAuthorization =
  | {
      allowed: false;
      status: 401 | 403;
      error: "UNAUTHENTICATED" | "FORBIDDEN";
    }
  | {
      allowed: true;
      isAdmin: boolean;
      supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
    };

export async function authorizeRoomMutation(
  roomId: string,
): Promise<RoomMutationAuthorization> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      allowed: false,
      status: 401,
      error: "UNAUTHENTICATED",
    };
  }

  const { data: adminLevel } = await supabase.rpc(
    "get_my_admin_level",
  );

  const numericAdminLevel = Number(adminLevel ?? 0);
  const isAdmin = numericAdminLevel === 1 || numericAdminLevel === 2;

  if (isAdmin) {
    return {
      allowed: true,
      isAdmin: true,
      supabase,
    };
  }

  if (!UUID_PATTERN.test(roomId)) {
    return {
      allowed: false,
      status: 403,
      error: "FORBIDDEN",
    };
  }

  const { data: canManage, error: accessError } = await supabase.rpc(
    "can_manage_room",
    { p_room_id: roomId },
  );

  if (accessError || canManage !== true) {
    return {
      allowed: false,
      status: 403,
      error: "FORBIDDEN",
    };
  }

  return {
    allowed: true,
    isAdmin: false,
    supabase,
  };
}
