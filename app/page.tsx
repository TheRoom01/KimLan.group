import HomeClient from "./HomeClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchRoomsServer } from "@/lib/fetchRoomsServer";
import ContactFAB from "@/components/ContactFAB";

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

function parseNumberSafe(v: string | null, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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

  const supabase = await createSupabaseServerClient();

  // 1) Resolve user + admin level on server
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user ?? null;

  let adminLevel: 0 | 1 | 2 = 0;

  try {
    const { data: lvlData } = await supabase.rpc("get_my_admin_level");
    const lvl = Number(lvlData ?? 0);
    adminLevel = (lvl === 2 ? 2 : lvl === 1 ? 1 : 0) as 0 | 1 | 2;
  } catch {
    adminLevel = 0;
  }

  // 2) Fetch filter options on server (optional but faster first paint)
  let initialDistricts: string[] = [];
  let initialRoomTypes: string[] = [];
  try {
    const { data } = await supabase.rpc("get_public_filters");
    if (data) {
      initialDistricts = (data as any).districts ?? [];
      initialRoomTypes = (data as any).roomTypes ?? [];
    }
  } catch {
    // ignore
  }

  // 3) Read filters from URL (SSR must match client URL state)
  const qRaw = firstString(sp.q);
  const minRaw = firstString(sp.min);
  const maxRaw = firstString(sp.max);
  const dRaw = firstString(sp.d);
  const rtRaw = firstString(sp.t) ?? firstString(sp.rt);
  const stRaw = firstString(sp.st);
  const mRaw = firstString(sp.m);
  const sRaw = firstString(sp.s);

  const search = qRaw ? decodeURIComponent(qRaw).trim() : null;

  const minPrice = parseNumberSafe(minRaw, 3_000_000);
  const maxPrice = parseNumberSafe(maxRaw, 30_000_000);

  const districts = parseCsv(dRaw);
  const roomTypes = parseCsv(rtRaw);

  const status = stRaw ? decodeURIComponent(stRaw) : null;

  const move =
    mRaw === "elevator" || mRaw === "stairs"
      ? (mRaw as "elevator" | "stairs")
      : null;

  const sortMode = parseSortMode(sRaw);

  // 4) Fetch first page on server using URL-derived filters
  const LIMIT = 20;
  const res = await fetchRoomsServer(supabase, {
    limit: LIMIT,
    cursor: null,
    adminLevel,
    search,
    minPrice,
    maxPrice,
    districts,
    roomTypes,
    move,
    status,
    sortMode,
  });

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