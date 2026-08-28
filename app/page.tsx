import HomeClient from "./HomeClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchRoomsServer } from "@/lib/fetchRoomsServer";
import ContactFAB from "@/components/ContactFAB";
import { getCachedPublicRooms } from "@/lib/rooms/publicCache";
import { cookies } from "next/headers";

function firstString(v: string | string[] | undefined): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return null;
}

function parseCsv(v: string | null): string[] | null {
  if (!v) return null;

  const arr = v
    .split(",")
    .map((s) => decodeURIComponent(s).trim())
    .filter(Boolean);

  return arr.length ? arr : null;
}

function parseOptionalNumber(v: string | null): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseSortMode(
  v: string | null
): "updated_desc" | "price_asc" | "price_desc" {
  if (v === "price_asc" || v === "price_desc" || v === "updated_desc") {
    return v;
  }
  return "updated_desc";
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};

  const cookieStore = await cookies();
  const hasAuthCookie = cookieStore
    .getAll()
    .some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"));
  const supabase = hasAuthCookie ? await createSupabaseServerClient() : null;

  // 1) Chỉ xác minh server khi request thực sự mang Supabase auth cookie.
  const user = supabase
    ? (await supabase.auth.getUser()).data.user ?? null
    : null;

  let adminLevel: 0 | 1 | 2 = 0;

  // Khách công khai không cần trả thêm một RPC chỉ để nhận lại level 0.
  if (user) {
    try {
      const { data: lvlData } = await supabase!.rpc("get_my_admin_level");
      const lvl = Number(lvlData ?? 0);
      adminLevel = (lvl === 2 ? 2 : lvl === 1 ? 1 : 0) as 0 | 1 | 2;
    } catch {
      adminLevel = 0;
    }
  }

  // 2) Read filters from URL (SSR must match client URL state)
  const qRaw = firstString(sp.q);
  const minRaw = firstString(sp.min);
  const maxRaw = firstString(sp.max);
   const dRaw = firstString(sp.d);
  const rtRaw = firstString(sp.t) ?? firstString(sp.rt);
  const stRaw = firstString(sp.st);
  const mRaw = firstString(sp.m);
  const petRaw = firstString(sp.pet);
  const termRaw = firstString(sp.term);
  const sRaw = firstString(sp.s);

  const search = qRaw ? decodeURIComponent(qRaw).trim() : null;

  // Không có min/max trên URL nghĩa là chưa bật lọc giá. Gửi null để RPC
  // trả cả phòng có giá lẫn phòng chưa có giá.
  const minPrice = parseOptionalNumber(minRaw);
  const maxPrice = parseOptionalNumber(maxRaw);

   const districts = parseCsv(dRaw);
  const roomTypes = parseCsv(rtRaw);

  const status = stRaw ? decodeURIComponent(stRaw) : null;

  const move =
    mRaw === "elevator" || mRaw === "stairs"
      ? (mRaw as "elevator" | "stairs")
      : null;

  const petPoliciesRaw = parseCsv(petRaw);
  const contractTermsRaw = parseCsv(termRaw);

  const petPolicies =
    petPoliciesRaw?.filter(
      (v): v is "cat" | "dog" | "nopet" =>
        v === "cat" || v === "dog" || v === "nopet"
    ) ?? null;

  const contractTerms =
    contractTermsRaw?.filter(
      (v): v is "short" | "long" =>
        v === "short" || v === "long"
    ) ?? ["long"];

  const sortMode = parseSortMode(sRaw);

  // 3) Fetch first page on server using URL-derived filters
  const LIMIT = 20;
  const fetchParams = {
    limit: LIMIT,
    cursor: null,
    adminLevel,
    search,
    minPrice,
    maxPrice,
    districts,
    roomTypes,
    move,
    petPolicies,
    contractTerms,
    status,
    sortMode,
  } as const;

  const res = user
    ? await fetchRoomsServer(supabase!, fetchParams)
    : await getCachedPublicRooms(fetchParams);

  return (
    <>
      <HomeClient
        initialRooms={res.data}
        initialNextCursor={res.nextCursor}
        initialAdminLevel={adminLevel}
        initialTotal={res.total ?? null}
      />

      {false && <ContactFAB />}
    </>
  );
}
