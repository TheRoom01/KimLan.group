import HomeClient from "./HomeClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchRoomsServer } from "@/lib/fetchRoomsServer";
import { HIDDEN_ROOMS_ADMIN_EMAIL, readHomeListFilters, readHomeListPage } from "@/lib/rooms/listFilters";
import { getCachedPublicRooms } from "@/lib/rooms/publicCache";
import { getAnonymousHomeAccess, getVipHomeAccess } from "@/lib/rooms/anonymousHomeAccess";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readRoomSearchConfig } from "@/lib/rooms/interpretRoomSearch";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const getParam = (key: string) => {
    const value = sp[key];
    return (Array.isArray(value) ? value[0] : value) ?? null;
  };
  const { nextPage, c } = readHomeListPage(getParam);
  const savedView = getParam("view") === "saved";
  const hasVipTokenParam = Boolean(getParam("vip")?.trim());

  const cookieStore = await cookies();
  const hasAuthCookie = cookieStore.getAll()
    .some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"));
  const supabase = hasAuthCookie ? await createSupabaseServerClient() : null;
  const user = supabase ? (await supabase.auth.getUser()).data.user ?? null : null;
  let adminLevel: 0 | 1 | 2 = 0;
  if (user && supabase) {
    try {
      const { data } = await supabase.rpc("get_my_admin_level");
      const level = Number(data ?? 0);
      if (level === 1 || level === 2) adminLevel = level;
    } catch {
      adminLevel = 0;
    }
  }

  const canFilterHidden = Boolean(adminLevel && user?.email?.toLowerCase() === HIDDEN_ROOMS_ADMIN_EMAIL);
  const vipAccess = user ? null : await getVipHomeAccess();
  const anonymousAccess = user || vipAccess ? null : await getAnonymousHomeAccess();
  const filters = readHomeListFilters(key => {
    const value = getParam(key);
    return key === "s" && value === "hidden" && !canFilterHidden ? null : value;
  });
  const fetchParams = {
    limit: 20,
    cursor: null,
    adminLevel,
    search: filters.search,
    minPrice: filters.priceFilterActive ? filters.priceApplied[0] : null,
    maxPrice: filters.priceFilterActive ? filters.priceApplied[1] : null,
    districts: filters.selectedDistricts,
    roomTypes: filters.selectedRoomTypes,
    move: filters.moveFilter,
    petPolicies: filters.petFilters,
    contractTerms: filters.termFilters,
    featureFilters: filters.featureFilters,
    status: filters.statusFilter,
    badge: filters.badgeFilter,
    sortMode: filters.sortMode,
  };
  // A later page uses its URL cursor or back snapshot on the client. Avoid
  // fetching and rendering page zero under that URL.
  const res = savedView || nextPage > 0
    ? { data: [], nextCursor: null, total: null, error: "" }
    : user && supabase
      ? await fetchRoomsServer(supabase, fetchParams)
      : vipAccess
        ? await fetchRoomsServer(createSupabaseAdminClient(), {
            ...fetchParams,
            vipAccessTokenHash: vipAccess.tokenHash,
          })
        : anonymousAccess && !anonymousAccess.expired
          ? await getCachedPublicRooms(fetchParams, anonymousAccess.sessionId)
          : { data: [], nextCursor: null, total: 0, error: "" };

  return (
    <HomeClient
      key={JSON.stringify([filters, nextPage, c, savedView, adminLevel, user?.id ?? null])}
      initialRooms={res.data}
      initialNextCursor={res.nextCursor}
      initialAdminLevel={adminLevel}
      initialCanFilterHidden={canFilterHidden}
      initialUserId={user?.id ?? null}
      initialTotal={res.total ?? null}
      initialError={res.error}
      initialSavedView={savedView}
      initialFilters={filters}
      naturalSearchEnabled={Boolean(readRoomSearchConfig())}
      initialPageIndex={nextPage}
      initialAnonSessionId={anonymousAccess?.sessionId ?? null}
      initialAnonExpiresAt={anonymousAccess?.expiresAt ?? null}
      initialAnonExpired={Boolean(!vipAccess && !hasVipTokenParam && (anonymousAccess?.expired || (!user && !anonymousAccess)))}
      initialVipTokenPresent={hasVipTokenParam}
      initialVipAccessTokenHash={vipAccess?.tokenHash ?? null}
      initialVipExpiresAt={vipAccess?.expiresAt ?? null}
      initialVipAdminPhone={vipAccess?.creatorAdminPhone ?? null}
      initialVipAdminName={vipAccess?.creatorAdminName ?? null}
    />
  );
}
