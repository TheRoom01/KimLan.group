import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseZaloRoomText } from "@/lib/zalo-import/parser";
import { resolveZaloImportRoom } from "@/lib/zalo-import/resolve";

import {
  makeZaloTempImageKey,
  uploadBufferToR2,
} from "@/lib/r2/zalo-temp";

export const runtime = "nodejs";

type IncomingImage = {
  name?: string;
  mimeType?: string;
  base64?: string;
};

function checkSecret(req: Request) {
  const expected = process.env.ZALO_READER_INTERNAL_SECRET || "";
  const got = req.headers.get("x-internal-secret") || "";
  return Boolean(expected && got && expected === got);
}

function makeHash(input: {
  groupName: string;
  senderName: string;
  rawText: string;
  sentAt?: string | null;
  sourceMessageId?: string | null;
}) {
  const raw = [
    input.groupName,
    input.senderName,
    input.sourceMessageId || "",
    input.sentAt || "",
    input.rawText,
  ].join("|");

  return createHash("sha256").update(raw).digest("hex");
}

function base64ToBuffer(base64: string) {
  const clean = String(base64 || "")
    .replace(/^data:[^;]+;base64,/, "")
    .trim();

  return Buffer.from(clean, "base64");
}


export async function POST(req: Request) {
  try {
    if (!checkSecret(req)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const groupName = String(body.groupName || "").trim();
    const senderName = String(body.senderName || "").trim();
    const rawText = String(body.rawText || "").trim();
    const sourceMessageId = String(body.sourceMessageId || "").trim() || null;
    const sentAt = String(body.sentAt || "").trim() || null;
    const images = Array.isArray(body.images) ? (body.images as IncomingImage[]) : [];

    if (!groupName || !senderName || !rawText) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing groupName/senderName/rawText",
        },
        { status: 400 }
      );
    }

    const sourceHash =
      String(body.sourceHash || "").trim() ||
      makeHash({
        groupName,
        senderName,
        rawText,
        sentAt,
        sourceMessageId,
      });

    const supabase = createSupabaseAdminClient();

    const existed = await supabase
      .from("zalo_import_batches")
      .select("id,status")
      .eq("source_hash", sourceHash)
      .maybeSingle();

    if (existed.error) {
      throw existed.error;
    }

    if (existed.data?.id) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        batchId: existed.data.id,
        status: existed.data.status,
      });
    }

   const parsed = parseZaloRoomText(rawText);

   const resolved = await resolveZaloImportRoom({
    supabase,
    roomPayload: parsed.roomPayload,
    detailPayload: parsed.detailPayload,
    });

    const batchIns = await supabase
      .from("zalo_import_batches")
      .insert({
        group_name: groupName,
        sender_name: senderName,
        source_message_id: sourceMessageId,
        source_hash: sourceHash,
        raw_text: rawText,
        sent_at: sentAt,
        status: "Chờ duyệt",
        parser_version: "simple-v1",
        parser_result: {
        room_payload: resolved.roomPayload,
        detail_payload: resolved.detailPayload,
        source_field_map: parsed.sourceFieldMap,
        inherited_field_map: resolved.inheritedFieldMap,
        matched_room_id: resolved.matchedRoom?.id ?? null,
        matched_reason: resolved.matchedReason || null,
        },
      })
      .select("id")
      .single();

    if (batchIns.error) {
      throw batchIns.error;
    }

    const batchId = String(batchIns.data.id);

    const uploadedImages: any[] = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i] || {};
      const base64 = String(img.base64 || "").trim();

      if (!base64) continue;

      const mimeType = String(img.mimeType || "image/webp").trim();
      const imageId = crypto.randomUUID();
      const ext =
        mimeType.includes("png")
          ? "png"
          : mimeType.includes("jpeg") || mimeType.includes("jpg")
          ? "jpg"
          : "webp";

      const key = makeZaloTempImageKey(batchId, imageId, ext);
      const buffer = base64ToBuffer(base64);

      const uploaded = await uploadBufferToR2({
        key,
        buffer,
        contentType: mimeType,
        cacheControl: "public, max-age=86400",
      });

      uploadedImages.push({
        batch_id: batchId,
        temp_r2_key: uploaded.key,
        temp_image_url: uploaded.url,
        original_name: img.name || null,
        mime_type: mimeType,
        size_bytes: buffer.length,
        selected: true,
        sort_order: i,
      });
    }

    if (uploadedImages.length > 0) {
      const imgIns = await supabase
        .from("zalo_import_images")
        .insert(uploadedImages);

      if (imgIns.error) {
        throw imgIns.error;
      }
    }

    const pendingIns = await supabase
    .from("pending_room_versions")
    .insert({
        batch_id: batchId,
        status: resolved.matchedRoom ? "Trùng phòng" : "Chờ duyệt",
        confidence_score: parsed.confidenceScore,
        room_payload: resolved.roomPayload,
        detail_payload: resolved.detailPayload,
        source_field_map: parsed.sourceFieldMap,
        inherited_field_map: resolved.inheritedFieldMap,
        matched_room_id: resolved.matchedRoom?.id ?? null,
        matched_reason: resolved.matchedReason || null,
        old_status: resolved.matchedRoom?.status ?? null,
        new_status: resolved.matchedRoom ? resolved.roomPayload.status ?? null : null,
    })
    .select("id")
    .single();

    if (pendingIns.error) {
      throw pendingIns.error;
    }

    return NextResponse.json({
      ok: true,
      duplicate: false,
      batchId,
      pendingVersionId: pendingIns.data.id,
      imageCount: uploadedImages.length,
    });
  } catch (e: any) {
    console.error("zalo-reader import failed:", e);

    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "Import failed",
      },
      { status: 500 }
    );
  }
}