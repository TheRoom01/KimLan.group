import { getAuthenticatedUser } from "@/lib/api/auth";
import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { propertyDisplayAddress } from "@/lib/owner/propertyDisplayAddress";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập để xem thông tin tài khoản",
        401,
      );
    }

    const [
      panelResponse,
      avatarResponse,
    ] = await Promise.all([
      supabase.rpc(
        "get_owner_account_panel_v1",
      ),

      supabase.rpc(
        "get_owner_member_avatars_v1",
      ),
    ]);

    if (panelResponse.error) {
      return mapDatabaseError(
        panelResponse.error,
      );
    }

    if (avatarResponse.error) {
      return mapDatabaseError(
        avatarResponse.error,
      );
    }

    const panel =
      panelResponse.data &&
      typeof panelResponse.data ===
        "object" &&
      !Array.isArray(
        panelResponse.data,
      )
        ? {
            ...panelResponse.data,
          }
        : {};

    const avatarRows =
      Array.isArray(avatarResponse.data)
        ? avatarResponse.data
        : [];

    const avatarByUserId =
      new Map<string, string | null>();

    for (const candidate of avatarRows) {
      if (
        !candidate ||
        typeof candidate !== "object"
      ) {
        continue;
      }

      const row =
        candidate as Record<
          string,
          unknown
        >;

      const userId =
        typeof row.user_id === "string"
          ? row.user_id
          : null;

      const avatarUrl =
        typeof row.avatar_url === "string"
          ? row.avatar_url
          : null;

      if (userId) {
        avatarByUserId.set(
          userId,
          avatarUrl,
        );
      }
    }

    const panelMembers =
      Array.isArray(
        (
          panel as {
            members?: unknown;
          }
        ).members,
      )
        ? (
            panel as {
              members: unknown[];
            }
          ).members
        : [];

    const { data: myMemberships, error: myMembershipError } = await supabase
      .from("property_members")
      .select("property_id, role, status")
      .eq("user_id", user.id)
      .eq("status", "active");
    if (myMembershipError) return mapDatabaseError(myMembershipError);

    const joinedPropertyIds = Array.from(new Set((myMemberships ?? []).map((membership) => membership.property_id).filter(Boolean)));
    const { data: liveProperties, error: livePropertyError } = joinedPropertyIds.length
      ? await supabase
          .from("properties")
          .select("id, code, name, house_number, address, ward, district, city, lifecycle_status")
          .in("id", joinedPropertyIds)
          .or("lifecycle_status.is.null,lifecycle_status.neq.archived")
      : { data: [], error: null };
    if (livePropertyError) return mapDatabaseError(livePropertyError);

    const propertyById = new Map((liveProperties ?? []).map((property) => [property.id, property]));
    const livePropertyIds = [...propertyById.keys()];
    const { data: sharedMemberships, error: sharedMembershipError } = livePropertyIds.length
      ? await supabase
          .from("property_members")
          .select("property_id, user_id, role, status")
          .in("property_id", livePropertyIds)
          .eq("status", "active")
      : { data: [], error: null };
    if (sharedMembershipError) return mapDatabaseError(sharedMembershipError);

    const profileByUserId = new Map<string, Record<string, unknown>>();
    for (const candidate of panelMembers) {
      if (!candidate || typeof candidate !== "object") continue;
      const member = candidate as Record<string, unknown>;
      if (typeof member.user_id === "string") profileByUserId.set(member.user_id, member);
    }

    const toPanelProperty = (propertyId: string, role: string) => {
      const property = propertyById.get(propertyId);
      if (!property) return null;
      return { ...property, name: propertyDisplayAddress(property), role, status: "active" };
    };
    const properties = (myMemberships ?? [])
      .map((membership) => toPanelProperty(membership.property_id, membership.role))
      .filter(Boolean);

    const membershipsByUser = new Map<string, typeof sharedMemberships>();
    for (const membership of sharedMemberships ?? []) {
      if (membership.user_id === user.id) continue;
      const current = membershipsByUser.get(membership.user_id) ?? [];
      current.push(membership);
      membershipsByUser.set(membership.user_id, current);
    }

    const sharedMemberIds = [...membershipsByUser.keys()];
    const admin = createSupabaseAdminClient();
    const { data: memberPhones, error: memberPhonesError } = sharedMemberIds.length
      ? await admin
          .from("member_contact_phones")
          .select("id, user_id, phone, is_primary, is_verified")
          .in("user_id", sharedMemberIds)
          .order("is_primary", { ascending: false })
      : { data: [], error: null };
    if (memberPhonesError) return mapDatabaseError(memberPhonesError);

    const phonesByUserId = new Map<string, typeof memberPhones>();
    for (const phone of memberPhones ?? []) {
      const current = phonesByUserId.get(phone.user_id) ?? [];
      current.push(phone);
      phonesByUserId.set(phone.user_id, current);
    }

    const members = [...membershipsByUser.entries()].map(([userId, memberships]) => {
      const profile = profileByUserId.get(userId) ?? {};
      return {
        ...profile,
        user_id: userId,
        avatar_url: avatarByUserId.get(userId) ?? null,
        phones: phonesByUserId.get(userId) ?? [],
        roles: Array.from(new Set(memberships.map((membership) => membership.role))),
        properties: memberships
          .map((membership) => toPanelProperty(membership.property_id, membership.role))
          .filter(Boolean),
      };
    });
    const myRoles = (myMemberships ?? [])
      .filter((membership) => propertyById.has(membership.property_id))
      .map((membership) => membership.role);
    const workspaceRole = myRoles.includes("owner") ? "owner" : myRoles.includes("manager") ? "manager" : myRoles.includes("viewer") ? "viewer" : "member";

    return apiSuccess({
      ...panel,
      workspace_role: workspaceRole,
      can_edit_members: myRoles.includes("owner"),
      properties,
      members,
    });

  } catch (error) {
    return mapUnknownError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập để cập nhật thông tin",
        401,
      );
    }

    const payload = await readJsonObject(request);

    const { data, error } = await supabase.rpc(
      "update_my_owner_profile_v1",
      {
        p_payload: payload,
      },
    );

    if (error) {
      return mapDatabaseError(error);
    }

    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}
