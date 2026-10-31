import { NextResponse } from "next/server";
import { importFilters, applyImportFilters } from "@/lib/zalo-import/filters";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deleteR2Keys } from "@/lib/r2/zalo-temp";

export const runtime = "nodejs";

const DELETE_CHUNK_SIZE = 200;
const ALLOWED_FILTER_STATUSES = new Set([
  "Chờ duyệt",
  "Trùng phòng",
  "Đã duyệt",
  "Từ chối",
  "Hết hạn",
]);

function chunks<T>(values: T[], size = DELETE_CHUNK_SIZE) {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

async function assertAdmin() {
  const supabaseUser = await createSupabaseServerClient();

  const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !user) return { ok: false as const, status: 401, error: "Unauthorized" };

  const { data: levelData, error: levelErr } =
    await supabaseUser.rpc("get_my_admin_level");

  const level = Number(levelData ?? 0);
  if (levelErr || (level !== 1 && level !== 2)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, user };
}

export async function POST(req: Request) {
  try {
    const admin = await assertAdmin();
    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
    }

    const body = await req.json().catch(() => ({}));
    const filters = importFilters(body);
    const deleteAllFiltered = body?.allFiltered === true || body?.allPending === true;
    const requestedStatus = body?.allPending === true
      ? "Chờ duyệt"
      : String(body?.status || "").trim();

    if (
      deleteAllFiltered &&
      requestedStatus &&
      !ALLOWED_FILTER_STATUSES.has(requestedStatus)
    ) {
      return NextResponse.json(
        { ok: false, error: "Invalid status filter" },
        { status: 400 }
      );
    }

    let ids = Array.isArray(body?.ids)
      ? body.ids.map((x: any) => String(x || "").trim()).filter(Boolean)
      : [];

    const supabase = createSupabaseAdminClient();

    if (deleteAllFiltered) {
      const pageSize = 1_000;
      for (let from = 0; ; from += pageSize) {
        let query = supabase
          .from("pending_room_versions")
          .select(`id,batch:zalo_import_batches${filters.group ? "!inner" : ""}(group_name)`)
          .order("id", { ascending: true })
          .range(from, from + pageSize - 1);

        if (requestedStatus) {
          query = query.eq("status", requestedStatus);
        }
        query = applyImportFilters(query, filters);

        const { data, error } = await query;

        if (error) throw error;
        const pageIds = (data ?? [])
          .map((row: any) => String(row.id || "").trim())
          .filter(Boolean);
        ids.push(...pageIds);
        if (pageIds.length < pageSize) break;
      }
    }

    if (ids.length === 0) {
      if (deleteAllFiltered) {
        return NextResponse.json({ ok: true, deleted: 0 });
      }
      return NextResponse.json({ ok: false, error: "Missing ids" }, { status: 400 });
    }

    const pendings: Array<{ id: string; batch_id: string | null }> = [];
    for (const idChunk of chunks(ids)) {
      let query = supabase
        .from("pending_room_versions")
        .select("id,batch_id")
        .in("id", idChunk);

      if (deleteAllFiltered && requestedStatus) {
        query = query.eq("status", requestedStatus);
      }

      const { data, error } = await query;
      if (error) throw error;
      pendings.push(...((data ?? []) as typeof pendings));
    }

    const batchIds = Array.from(
      new Set((pendings ?? []).map((x: any) => String(x.batch_id)).filter(Boolean))
    );

    let deleted = 0;
    for (const idChunk of chunks(pendings.map((row) => row.id))) {
      let deleteQuery = supabase
        .from("pending_room_versions")
        .delete()
        .in("id", idChunk);

      if (deleteAllFiltered && requestedStatus) {
        deleteQuery = deleteQuery.eq("status", requestedStatus);
      }

      const { data, error } = await deleteQuery.select("id");
      if (error) throw error;
      deleted += data?.length ?? 0;
    }

    const remainingBatchIds = new Set<string>();
    for (const batchChunk of chunks(batchIds)) {
      const { data, error } = await supabase
        .from("pending_room_versions")
        .select("batch_id")
        .in("batch_id", batchChunk);
      if (error) throw error;
      for (const row of data ?? []) {
        const batchId = String((row as any).batch_id || "").trim();
        if (batchId) remainingBatchIds.add(batchId);
      }
    }

    const cleanupWarnings: string[] = [];
    const orphanBatchIds = batchIds.filter((batchId) => !remainingBatchIds.has(batchId));
    for (const batchChunk of chunks(orphanBatchIds)) {
      try {
        const [imageResult, videoResult] = await Promise.all([
          supabase
            .from("zalo_import_images")
            .select("temp_r2_key")
            .in("batch_id", batchChunk),
          supabase
            .from("zalo_import_videos")
            .select("temp_r2_key,temp_thumb_r2_key")
            .in("batch_id", batchChunk),
        ]);

        if (imageResult.error) throw imageResult.error;
        if (videoResult.error) throw videoResult.error;

        const tempKeys = [
          ...(imageResult.data ?? []).map((row: any) => row.temp_r2_key),
          ...(videoResult.data ?? []).flatMap((row: any) => [
            row.temp_r2_key,
            row.temp_thumb_r2_key,
          ]),
        ]
          .map((key) => String(key || "").trim())
          .filter(Boolean);

        if (tempKeys.length > 0) await deleteR2Keys(tempKeys);

        const delVideos = await supabase
          .from("zalo_import_videos")
          .delete()
          .in("batch_id", batchChunk);
        if (delVideos.error) throw delVideos.error;

        const delImages = await supabase
          .from("zalo_import_images")
          .delete()
          .in("batch_id", batchChunk);
        if (delImages.error) throw delImages.error;

        const delBatch = await supabase
          .from("zalo_import_batches")
          .delete()
          .in("id", batchChunk);
        if (delBatch.error) throw delBatch.error;
      } catch (cleanupError: any) {
        cleanupWarnings.push(
          cleanupError?.message || "Không dọn được media tạm của một số batch"
        );
        console.error("cleanup removed Zalo import batches failed:", cleanupError);
      }
    }

    return NextResponse.json({
      ok: true,
      deleted,
      cleanupWarnings,
    });
  } catch (e: any) {
    console.error("bulk remove zalo imports failed:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Bulk remove failed" },
      { status: 500 }
    );
  }
}
