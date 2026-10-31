import {
  createHash,
  randomUUID,
} from "crypto";

import { NextResponse } from "next/server";
import { officialSourceIdentity, confirmOfficialRun, existingOfficialReceipt } from "./official-request";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseZaloRoomText } from "@/lib/zalo-import/parser";
import { resolveZaloImportRoom } from "@/lib/zalo-import/resolve";
import { findImportBaseline, assessIncomingChange } from "@/lib/zalo-import/incoming-change";
import {
  evaluateZaloImportQuality,
  readZaloAutoImportSettings,
} from "@/lib/zalo-import/quality";
import { publishPendingRoom } from "@/lib/zalo-import/publish-pending-room";
import {
  isControlledZaloTarget,
  shouldAutoPublishZaloImport,
  makeTestPendingIdentity,
} from "@/lib/zalo-reader/controlled-staging";

import {
  makeZaloTempImageKey,
  uploadBufferToR2,
  deleteR2Keys,
} from "@/lib/r2/zalo-temp";

export const runtime = "nodejs";

type IncomingImage = {
  name?: string;
  mimeType?: string;
  base64?: string;
};

type IncomingVideo = {
  messageId?: string;
  sourceUrl?: string;
  thumbnailUrl?: string;

  durationMs?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
};

type IncomingReaderIssue = {
  code?: string;
  level?: string;
  index?: number | null;
  message?: string;
  sourceUrl?: string | null;
};

type ImportIssue = {
  code?: string;
  level: "warning" | "error";

  stage:
    | "reader"
    | "image"
    | "video"
    | "thumbnail"
    | "database"
    | "media";

  index: number | null;

  message: string;

  sourceUrl?: string | null;
};

function checkSecret(req: Request) {
  const expected =
    process.env.ZALO_READER_INTERNAL_SECRET || "";

  const got =
    req.headers.get("x-internal-secret") || "";

  return Boolean(
    expected &&
      got &&
      expected === got
  );
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

  return createHash("sha256")
    .update(raw)
    .digest("hex");
}

function base64ToBuffer(base64: string) {
  const clean = String(base64 || "")
    .replace(
      /^data:[^;]+;base64,/,
      ""
    )
    .trim();

  return Buffer.from(
    clean,
    "base64"
  );
}

function getErrorMessage(
  error: unknown
) {
  if (
    error instanceof Error &&
    error.message
  ) {
    return error.message;
  }

  if (
    typeof error === "string"
  ) {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

type ImportStage =
  | "request"
  | "auth"
  | "parse-request"
  | "lookup-existing"
  | "parse-room"
  | "resolve-room"
  | "compare-new-source"
  | "batch-insert"
  | "image-upload"
  | "image-insert"
  | "video-upload"
  | "video-insert"
  | "batch-update"
  | "pending-insert"
  | "response";

function sanitizePostgrestString(
  input: string
) {
  let output = "";

  for (
    let index = 0;
    index < input.length;
    index++
  ) {
    const code =
      input.charCodeAt(index);

    if (code === 0) {
      continue;
    }

    if (
      code >= 0xd800 &&
      code <= 0xdbff
    ) {
      const nextCode =
        input.charCodeAt(index + 1);

      if (
        nextCode >= 0xdc00 &&
        nextCode <= 0xdfff
      ) {
        output +=
          input[index] +
          input[index + 1];
        index++;
      } else {
        output += "\uFFFD";
      }

      continue;
    }

    if (
      code >= 0xdc00 &&
      code <= 0xdfff
    ) {
      output += "\uFFFD";
      continue;
    }

    output += input[index];
  }

  return output;
}

function toPostgrestJsonValue(
  value: unknown,
  seen = new WeakSet<object>()
): unknown {
  if (value === null) {
    return null;
  }

  const valueType =
    typeof value;

  if (valueType === "string") {
    return sanitizePostgrestString(
      value as string
    );
  }

  if (valueType === "number") {
    return Number.isFinite(
      value as number
    )
      ? value
      : null;
  }

  if (valueType === "boolean") {
    return value;
  }

  if (valueType === "bigint") {
    return String(value);
  }

  if (
    valueType === "undefined" ||
    valueType === "function" ||
    valueType === "symbol"
  ) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(
      value.getTime()
    )
      ? null
      : value.toISOString();
  }

  if (
    value &&
    typeof value === "object"
  ) {
    if (seen.has(value)) {
      return null;
    }

    seen.add(value);

    if (Array.isArray(value)) {
      const output =
        value.map((item) =>
          toPostgrestJsonValue(
            item,
            seen
          )
        );

      seen.delete(value);
      return output;
    }

    const output:
      Record<string, unknown> = {};

    for (
      const [key, child] of
      Object.entries(value)
    ) {
      const childType =
        typeof child;

      if (
        childType === "undefined" ||
        childType === "function" ||
        childType === "symbol"
      ) {
        continue;
      }

      output[
        sanitizePostgrestString(
          key
        )
      ] = toPostgrestJsonValue(
        child,
        seen
      );
    }

    seen.delete(value);
    return output;
  }

  return null;
}

function makePostgrestPayload<T>(
  value: T,
  label: string
): T {
  try {
    const safeValue =
      toPostgrestJsonValue(value);

    const serialized =
      JSON.stringify(safeValue);

    if (
      !serialized ||
      serialized === "null"
    ) {
      throw new Error(
        "Payload JSON bị rỗng"
      );
    }

    return JSON.parse(
      serialized
    ) as T;
  } catch (error) {
    throw new Error(
      `${label}: ${getErrorMessage(error)}`
    );
  }
}

function getErrorDetails(
  error: unknown
) {
  if (
    !error ||
    typeof error !== "object"
  ) {
    return null;
  }

  const candidate =
    error as Record<string, unknown>;

  return {
    name:
      candidate.name ?? null,
    code:
      candidate.code ?? null,
    message:
      candidate.message ?? null,
    details:
      candidate.details ?? null,
    hint:
      candidate.hint ?? null,
    status:
      candidate.status ?? null,
  };
}

function toPositiveInt(
  value: unknown
): number | null {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed <= 0
  ) {
    return null;
  }

  return Math.round(parsed);
}

function toNonNegativeInt(
  value: unknown,
  fallback: number
) {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed < 0
  ) {
    return fallback;
  }

  return Math.round(parsed);
}

function makeZaloTempVideoKey(
  batchId: string,
  videoId: string,
  extension = "mp4"
) {
  return [
    "zalo-imports",
    batchId,
    "videos",
    `${videoId}.${extension}`,
  ].join("/");
}

function makeZaloTempVideoThumbKey(
  batchId: string,
  videoId: string,
  extension = "jpg"
) {
  return [
    "zalo-imports",
    batchId,
    "video-thumbs",
    `${videoId}.${extension}`,
  ].join("/");
}

function validateRemoteZaloUrl(
  rawUrl: string,
  kind: "video" | "thumbnail"
) {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(
      `URL ${kind} không hợp lệ`
    );
  }

  if (
    parsed.protocol !== "https:"
  ) {
    throw new Error(
      `URL ${kind} phải sử dụng HTTPS`
    );
  }

  const hostname =
    parsed.hostname.toLowerCase();

  const allowed =
    kind === "video"
      ? hostname === "dlmd.me" ||
        hostname.endsWith(
          ".dlmd.me"
        )
      : hostname === "zdn.vn" ||
        hostname.endsWith(
          ".zdn.vn"
        ) ||
        hostname === "zalo.me" ||
        hostname.endsWith(
          ".zalo.me"
        );

  if (!allowed) {
    throw new Error(
      `Hostname ${kind} không được phép: ${hostname}`
    );
  }

  return parsed.toString();
}

async function downloadRemoteBuffer(params: {
  url: string;
  maxBytes: number;
  fallbackContentType: string;
  timeoutMs?: number;
}) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      params.timeoutMs ??
        30_000
    );

  try {
    const response =
      await fetch(
        params.url,
        {
          method: "GET",
          redirect: "follow",
          signal:
            controller.signal,

          headers: {
            Accept: "*/*",

            "User-Agent":
              "Mozilla/5.0 KimLan-Zalo-Reader/1.0",
          },

          cache:
            "no-store",
        }
      );

    if (!response.ok) {
      throw new Error(
        `Không tải được media Zalo: HTTP ${response.status}`
      );
    }

    const declaredLength =
      Number(
        response.headers.get(
          "content-length"
        ) || 0
      );

    if (
      declaredLength > 0 &&
      declaredLength >
        params.maxBytes
    ) {
      throw new Error(
        `Media vượt giới hạn ${params.maxBytes} bytes`
      );
    }

    const arrayBuffer =
      await response.arrayBuffer();

    if (
      arrayBuffer.byteLength >
      params.maxBytes
    ) {
      throw new Error(
        `Media vượt giới hạn ${params.maxBytes} bytes`
      );
    }

    const contentType =
      String(
        response.headers.get(
          "content-type"
        ) ||
          params.fallbackContentType
      )
        .split(";")[0]
        .trim()
        .toLowerCase();

    return {
      buffer:
        Buffer.from(
          arrayBuffer
        ),

      contentType,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.name ===
        "AbortError"
    ) {
      throw new Error(
        `Hết thời gian tải media Zalo sau ${
          params.timeoutMs ??
          30_000
        }ms`
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function videoExtensionFromMime(
  mimeType: string
) {
  const normalized =
    mimeType.toLowerCase();

  if (
    normalized.includes(
      "webm"
    )
  ) {
    return "webm";
  }

  if (
    normalized.includes(
      "quicktime"
    )
  ) {
    return "mov";
  }

  return "mp4";
}

function imageExtensionFromMime(
  mimeType: string
) {
  const normalized =
    mimeType.toLowerCase();

  if (
    normalized.includes(
      "png"
    )
  ) {
    return "png";
  }

  if (
    normalized.includes(
      "webp"
    )
  ) {
    return "webp";
  }

  return "jpg";
}

function normalizeImageMimeType(
  mimeType: string
) {
  const normalized =
    String(
      mimeType || ""
    )
      .trim()
      .toLowerCase();

  if (
    normalized ===
    "image/jpg"
  ) {
    return "image/jpeg";
  }

  return normalized;
}

function normalizeReaderIssues(
  value: unknown
): ImportIssue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return (
    value as IncomingReaderIssue[]
  )
    .slice(0, 100)
    .map(
      (
        issue,
        position
      ): ImportIssue => {
        const rawIndex =
          Number(issue?.index);

        return {
          code: /^[A-Z][A-Z0-9_]{1,63}$/.test(String(issue?.code || "")) ? String(issue.code) : undefined,
          level:
            issue?.level ===
            "warning"
              ? "warning"
              : "error",

          stage: "reader",

          index:
            Number.isFinite(
              rawIndex
            )
              ? Math.round(
                  rawIndex
                )
              : position,

          message:
            String(
              issue?.message ||
                "Reader báo lỗi không xác định"
            ).trim(),

          sourceUrl:
            issue?.sourceUrl
              ? String(
                  issue.sourceUrl
                ).trim()
              : null,
        };
      }
    );
}

export async function POST(
  req: Request
) {
  let stage:
    ImportStage = "request";

  let currentSourceHash:
    string | null = null;

  let currentSourceMessageId:
    string | null = null;

  try {
    stage = "auth";

    if (!checkSecret(req)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    stage = "parse-request";

    const body =
      await req
        .json()
        .catch(() => null);

    if (
      !body ||
      typeof body !==
        "object"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Invalid JSON body",
        },
        {
          status: 400,
        }
      );
    }

    const groupName =
      sanitizePostgrestString(
        String(
          body.groupName || ""
        ).trim()
      );

    const sourceGroupId =
      sanitizePostgrestString(
        String(body.groupId || "").trim()
      );
    const stagingOnly = body.stagingOnly === true;
    const testImportToPending = body.testImportToPending === true;
    const testNewSourcesOnly = body.testNewSourcesOnly === true;
    const officialReader = body.officialReader === true;
    const officialTrial = officialReader && body.officialTrial === true;
    if (officialReader && (testImportToPending || stagingOnly)) return NextResponse.json({ ok: false, code: "MIXED_READER_MODES" }, { status: 400 });
    if (testNewSourcesOnly && !testImportToPending) return NextResponse.json({ ok: false, error: "testNewSourcesOnly chỉ dùng cho Pending test." }, { status: 400 });
    if (testImportToPending && !stagingOnly) {
      return NextResponse.json({ ok: false, error: "Test Pending chỉ được chạy trong staging." }, { status: 400 });
    }

    const senderName =
      sanitizePostgrestString(
        String(
          body.senderName || ""
        ).trim()
      );

    const rawText =
      sanitizePostgrestString(
        String(
          body.rawText || ""
        ).trim()
      );

    const sourceMessageId =
      sanitizePostgrestString(
        String(
          body.sourceMessageId ||
            ""
        ).trim()
      ) || null;

    currentSourceMessageId =
      sourceMessageId;

    const sentAt =
      sanitizePostgrestString(
        String(
          body.sentAt || ""
        ).trim()
      ) || null;

    if (
      stagingOnly &&
      !isControlledZaloTarget({
        groupId: sourceGroupId,
        groupName,
      })
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Staging trial chỉ chấp nhận đúng Group ID và tên nhóm đã xác minh.",
        },
        { status: 403 }
      );
    }

    if (stagingOnly) {
      const readerStartedAtMs = Number(body.readerStartedAtMs);
      const sentAtMs = sentAt ? Date.parse(sentAt) : NaN;
      const maxFutureStartMs = Date.now() + 60_000;
      if (
        !sourceMessageId ||
        !Number.isSafeInteger(readerStartedAtMs) ||
        readerStartedAtMs <= 0 ||
        readerStartedAtMs > maxFutureStartMs ||
        !Number.isFinite(sentAtMs) ||
        sentAtMs < readerStartedAtMs - 24 * 60 * 60 * 1000 ||
        sentAtMs > readerStartedAtMs
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Staging trial từ chối tin thiếu timestamp/ID hoặc nằm ngoài cửa sổ 24 giờ cố định từ lúc Reader bắt đầu.",
          },
          { status: 400 }
        );
      }
    }

    const images:
      IncomingImage[] =
      Array.isArray(
        body.images
      )
        ? body.images
        : [];

    const videos:
      IncomingVideo[] =
      Array.isArray(
        body.videos
      )
        ? body.videos.slice(
            0,
            2
          )
        : [];

    const expectedImageCount =
      toNonNegativeInt(
        body.expectedImageCount,
        images.length
      );

    const expectedVideoCount =
      toNonNegativeInt(
        body.expectedVideoCount,
        videos.length
      );

    const importIssues:
      ImportIssue[] =
      normalizeReaderIssues(
        body.readerIssues
      );

    if (
      !groupName ||
      !senderName ||
      !rawText
    ) {
      return NextResponse.json(
        {
          ok: false,

          error:
            "Missing groupName/senderName/rawText",
        },
        {
          status: 400,
        }
      );
    }

    const testIdentity = testImportToPending
      ? makeTestPendingIdentity(sourceGroupId, sourceMessageId || "") : null;
    const officialParsed = officialReader ? parseZaloRoomText(rawText) : null;
    const officialIdentity = officialParsed ? officialSourceIdentity({ groupName, groupId: sourceGroupId,
      sourceMessageId: sourceMessageId || "", sourceRoomKey: String(body.sourceRoomKey || ""), trial: officialTrial,
      runId: String(body.officialRunId || ""), verified: body.groupIdVerified === true }, officialParsed.roomPayload) : null;
    const sourceHash = officialIdentity?.sourceHash || testIdentity?.sourceHash ||
      sanitizePostgrestString(
        String(
          body.sourceHash || ""
        ).trim()
      ) ||
      makeHash({
        groupName,
        senderName,
        rawText,
        sentAt,
        sourceMessageId,
      });

    currentSourceHash =
      sourceHash;

    const supabase =
      createSupabaseAdminClient();
    if (officialIdentity) {
      await confirmOfficialRun(supabase, officialIdentity, sentAt);
      const receipt = await existingOfficialReceipt(supabase, officialIdentity, groupName, officialParsed!.roomPayload);
      if (receipt) return NextResponse.json(receipt);
    }

    stage = "lookup-existing";

    const existed =
      await supabase
        .from(
          "zalo_import_batches"
        )
        .select(
          "id,status,parser_result"
        )
        .eq(
          "source_hash",
          sourceHash
        )
        .maybeSingle();

    if (existed.error) {
      throw existed.error;
    }

    if (
      existed.data?.id && !testImportToPending && !officialReader
    ) {
      const parserResult =
        existed.data
          .parser_result as
          | Record<
              string,
              any
            >
          | null;

      return NextResponse.json({
        ok: true,
        duplicate: true,

        batchId:
          existed.data.id,

        status:
          existed.data
            .status,

        partial:
          Boolean(
            parserResult
              ?.import_diagnostics
              ?.has_errors
          ),

        hasImportErrors:
          Boolean(
            parserResult
              ?.import_diagnostics
              ?.has_errors
          ),

        imageCount:
          Number(
            parserResult
              ?.imported_media
              ?.image_count ??
              0
          ),

        videoCount:
          Number(
            parserResult
              ?.imported_media
              ?.video_count ??
              0
          ),

        issues:
          Array.isArray(
            parserResult
              ?.import_diagnostics
              ?.issues
          )
            ? parserResult
                ?.import_diagnostics
                ?.issues
            : [],
      });
    }

    let testPendingExists = false;
    let oldTestImages: any[] = [];
    let oldTestVideos: any[] = [];
    if (testIdentity) {
      if (existed.data && (existed.data.id !== testIdentity.batchId || (existed.data.parser_result as any)?.test_import !== true)) {
        return NextResponse.json({ ok: false, error: "Không được ghi đè batch import thật." }, { status: 409 });
      }
      const existingPending = await supabase.from("pending_room_versions").select("id,batch_id,status,room_payload").eq("id", testIdentity.pendingId).maybeSingle();
      if (existingPending.error) throw existingPending.error;
      if (existingPending.data) {
        const row = existingPending.data;
        if ((row.room_payload as any)?.is_test_import !== true || row.batch_id !== testIdentity.batchId || row.status !== "Chờ duyệt") {
          return NextResponse.json({ ok: false, error: "Chỉ cập nhật bản test đang Chờ duyệt; không ghi đè bản thật hoặc bản đã xử lý." }, { status: 409 });
        }
        testPendingExists = true;
        if (testNewSourcesOnly) return NextResponse.json({ ok: true, duplicate: true, testImportToPending: true,
          existingPendingId: row.id, testPendingAction: "skipped-existing", status: row.status });
      }
      if (existed.data) {
        const [oldImages, oldVideos] = await Promise.all([
          supabase.from("zalo_import_images").select("id,temp_r2_key").eq("batch_id", testIdentity.batchId),
          supabase.from("zalo_import_videos").select("id,temp_r2_key,temp_thumb_r2_key").eq("batch_id", testIdentity.batchId),
        ]);
        if (oldImages.error) throw oldImages.error;
        if (oldVideos.error) throw oldVideos.error;
        oldTestImages = oldImages.data || [];
        oldTestVideos = oldVideos.data || [];
      }
    }

    stage = "parse-room";

    const parsed = officialParsed ||
      parseZaloRoomText(
        rawText
      );

    stage = "resolve-room";

    const resolved =
      await resolveZaloImportRoom({
        supabase,
        sourceFieldMap: parsed.sourceFieldMap,
        skipInheritance: testImportToPending,
        excludePendingId: testIdentity?.pendingId,

        roomPayload:
          parsed.roomPayload,

        detailPayload:
          parsed.detailPayload,
      });

    const roomReview = resolved.roomPayload._room_import;
    if (!testImportToPending || testNewSourcesOnly) {
      stage = "compare-new-source";
      const baseline = await findImportBaseline(supabase, resolved.roomPayload, resolved.matchedRoom);
      if (baseline) {
        const comparison = assessIncomingChange({ room: resolved.roomPayload, detail: resolved.detailPayload,
          sourceFields: parsed.sourceFieldMap, baseline, expectedImages: expectedImageCount, expectedVideos: expectedVideoCount,
          imageHashes: images.map(image => { const bytes = base64ToBuffer(image.base64 || ""); return bytes.length ? createHash("sha256").update(bytes).digest("hex") : null; }),
          // Video URLs/thumbnails are not content hashes. Until bytes have been
          // verified, keep the existing review flow rather than falsely skip.
          videoHashes: videos.map(() => null), hasSourceErrors: importIssues.some(issue => issue.level === "error" || ["MEDIA_UNVERIFIED","MEDIA_LOADING_TIMEOUT","MEDIA_INCOMPLETE"].includes(issue.code || "")),
        });
        if (comparison.status === "UNCHANGED") {
          console.log("Zalo source comparison:", { sourceMessageId, status: "UNCHANGED", baseline: baseline.kind, pendingCreated: false });
          return NextResponse.json({ ok: true, duplicate: false, skipped: true, noChanges: true,
            testImportToPending,
            comparisonStatus: "UNCHANGED", reasonCode: "NO_ROOM_CHANGES", status: "Không có cập nhật",
            sourceMessageId, sourceHash, baselineKind: baseline.kind, baselineId: baseline.id,
            imageCount: 0, videoCount: 0, partial: false, hasImportErrors: false, issues: [],
            mediaProgress: { imagesUploaded: 0, videosDownloaded: 0, videosUploaded: 0 } });
        }
        roomReview.change_status = comparison.status;
        roomReview.changed_fields = comparison.changedFields;
      }
    }
    if ((!testImportToPending || testNewSourcesOnly) && roomReview?.conflicting_pending_ids?.length) {
      return NextResponse.json({ ok: false, code: "ROOM_PENDING_EXISTS", error: "Phòng đã có bản nháp chưa duyệt. Hãy xử lý bản nháp hiện tại trước khi nhập nguồn mới.",
        pendingIds: roomReview.conflicting_pending_ids }, { status: 409 });
    }

    stage = "batch-insert";

    const batchInsertPayload =
      makePostgrestPayload(
        {
          ...(officialIdentity ? { id: officialIdentity.batchId } : testIdentity ? { id: testIdentity.batchId } : {}),
          group_name:
            groupName,

          sender_name:
            senderName,

          source_message_id:
            sourceMessageId,

          source_hash:
            sourceHash,

          raw_text:
            rawText,

          sent_at:
            sentAt,

          status:
            "Chờ duyệt",

          parser_version:
            "quality-v1",

          parser_result: {
            ...(testImportToPending ? { test_import: true } : {}),
            staging_trial: stagingOnly,
            room_payload:
              resolved.roomPayload,

            detail_payload:
              resolved.detailPayload,

            source_field_map:
              parsed.sourceFieldMap,

            inherited_field_map:
              resolved.inheritedFieldMap,

            matched_room_id:
              resolved.matchedRoom
                ?.id ?? null,

            matched_reason:
              resolved.matchedReason ||
              null,

            import_diagnostics: {
              has_errors:
                importIssues.some(
                  (issue) =>
                    issue.level ===
                    "error"
                ),

              issue_count:
                importIssues.length,

              expected: {
                images:
                  expectedImageCount,

                videos:
                  expectedVideoCount,
              },

              imported: {
                images: 0,
                videos: 0,
              },

              issues:
                importIssues,
            },
          },
        },
        "zalo_import_batches.insert"
      );

    const batchIns = officialIdentity ? { data: { id: officialIdentity.batchId }, error: null } : existed.data && testIdentity
      ? { data: { id: testIdentity.batchId }, error: null }
      : await supabase
        .from(
          "zalo_import_batches"
        )
        .insert(
          batchInsertPayload
        )
        .select("id")
        .single();

    if (
      batchIns.error
    ) {
      throw batchIns.error;
    }

    const batchId =
      String(
        batchIns.data.id
      );

    const uploadedImages:
      any[] = [];
    let imagesUploaded = 0;
    let videosUploaded = 0;
    let videosDownloaded = 0;
    const imageHashes: Record<string, string> = {};
    const videoHashes: Record<string, string> = {};

    stage = "image-upload";

    for (
      let i = 0;
      i < images.length;
      i++
    ) {
      const img =
        images[i] || {};
      let imageFailureCode = "IMAGE_DECODE_FAILED";

      try {
        const base64 =
          String(
            img.base64 || ""
          ).trim();

        if (!base64) {
          throw new Error(
            "Ảnh không có dữ liệu Base64"
          );
        }

        const mimeType =
          normalizeImageMimeType(
            String(
              img.mimeType ||
                "image/webp"
            )
          );

        const allowedMimeTypes =
          [
            "image/webp",
            "image/png",
            "image/jpeg",
          ];

        if (
          !allowedMimeTypes.includes(
            mimeType
          )
        ) {
          throw new Error(
            `MIME ảnh không được hỗ trợ: ${mimeType}`
          );
        }

        const imageId =
          randomUUID();

        const ext =
          imageExtensionFromMime(
            mimeType
          );

        const key =
          makeZaloTempImageKey(
            batchId,
            imageId,
            ext
          );

        const buffer =
          base64ToBuffer(
            base64
          );

        if (
          buffer.length === 0
        ) {
          throw new Error(
            "Ảnh sau khi giải mã Base64 bị rỗng"
          );
        }

        imageFailureCode = "IMAGE_STORAGE_UPLOAD_FAILED";
        const uploaded =
          await uploadBufferToR2({
            key,
            buffer,

            contentType:
              mimeType,

            cacheControl:
              "public, max-age=86400",
          });

        imagesUploaded += 1;
        imageHashes[uploaded.url] = createHash("sha256").update(buffer).digest("hex");
        uploadedImages.push({
          batch_id:
            batchId,

          temp_r2_key:
            uploaded.key,

          temp_image_url:
            uploaded.url,

          original_name:
            img.name || null,

          mime_type:
            mimeType,

          size_bytes:
            buffer.length,

          selected: true,
          sort_order: i,
        });
      } catch (error) {
        importIssues.push({
          level: "error",
          stage: "image",
          code: imageFailureCode,
          index: i,

          message:
            getErrorMessage(
              error
            ),
        });

        console.error(
          `Ảnh ${i + 1} import lỗi:`,
          error
        );
      }
    }

    if (
      uploadedImages.length >
      0
    ) {
      stage = "image-insert";

      const imageInsertPayload =
        makePostgrestPayload(
          uploadedImages,
          "zalo_import_images.insert"
        );

      const imgIns =
        officialReader ? { error: null } : await supabase
          .from(
            "zalo_import_images"
          )
          .insert(
            imageInsertPayload
          );

      if (imgIns.error) {
        importIssues.push({
          level: "error",
          stage:
            "database",
          code: "IMAGE_DATABASE_LINK_FAILED",

          index: null,

          message:
            [
              "Không ghi được danh sách ảnh vào database.",
              getErrorMessage(
                imgIns.error
              ),
            ].join(" "),
        });

        uploadedImages.splice(
          0,
          uploadedImages.length
        );
      }
    }

    const uploadedVideos:
      any[] = [];

    stage = "video-upload";

    for (
      let i = 0;
      i < videos.length;
      i++
    ) {
      const video =
        videos[i] || {};

      const rawSourceUrl =
        String(
          video.sourceUrl ||
            ""
        ).trim();
      let videoFailureCode = "VIDEO_URL_INVALID";

      try {
        if (!rawSourceUrl) {
          throw new Error(
            "Video không có sourceUrl"
          );
        }

        const sourceUrl =
          validateRemoteZaloUrl(
            rawSourceUrl,
            "video"
          );

        videoFailureCode = "VIDEO_DOWNLOAD_FAILED";
        const downloadedVideo =
          await downloadRemoteBuffer({
            url: sourceUrl,

            maxBytes:
              100 *
              1024 *
              1024,

            fallbackContentType:
              "video/mp4",

            timeoutMs:
              60_000,
          });

        if (testImportToPending && (!downloadedVideo.buffer.length || !downloadedVideo.contentType.startsWith("video/"))) {
          throw new Error("Video test tải về rỗng hoặc MIME không phải video.");
        }
        videosDownloaded += 1;
        const videoId =
          randomUUID();

        const videoExtension =
          videoExtensionFromMime(
            downloadedVideo
              .contentType
          );

        const videoKey =
          makeZaloTempVideoKey(
            batchId,
            videoId,
            videoExtension
          );

        videoFailureCode = "VIDEO_STORAGE_UPLOAD_FAILED";
        const uploadedVideo =
          await uploadBufferToR2({
            key:
              videoKey,

            buffer:
              downloadedVideo
                .buffer,

            contentType:
              downloadedVideo
                .contentType,

            cacheControl:
              "public, max-age=86400",
          });

        videosUploaded += 1;
        videoHashes[uploadedVideo.url] = createHash("sha256").update(downloadedVideo.buffer).digest("hex");
        let uploadedThumb:
          | {
              key: string;
              url: string;
              mimeType:
                string;
              sizeBytes:
                number;
            }
          | null = null;

        const rawThumbnailUrl =
          String(
            video.thumbnailUrl ||
              ""
          ).trim();

        if (
          rawThumbnailUrl
        ) {
          try {
            const thumbnailUrl =
              validateRemoteZaloUrl(
                rawThumbnailUrl,
                "thumbnail"
              );

            const downloadedThumb =
              await downloadRemoteBuffer({
                url:
                  thumbnailUrl,

                maxBytes:
                  10 *
                  1024 *
                  1024,

                fallbackContentType:
                  "image/jpeg",

                timeoutMs:
                  30_000,
              });

            const thumbExtension =
              imageExtensionFromMime(
                downloadedThumb
                  .contentType
              );

            const thumbKey =
              makeZaloTempVideoThumbKey(
                batchId,
                videoId,
                thumbExtension
              );

            const thumbUpload =
              await uploadBufferToR2({
                key:
                  thumbKey,

                buffer:
                  downloadedThumb
                    .buffer,

                contentType:
                  downloadedThumb
                    .contentType,

                cacheControl:
                  "public, max-age=86400",
              });

            uploadedThumb = {
              key:
                thumbUpload.key,

              url:
                thumbUpload.url,

              mimeType:
                downloadedThumb
                  .contentType,

              sizeBytes:
                downloadedThumb
                  .buffer
                  .length,
            };
          } catch (
            thumbnailError
          ) {
            console.warn(
              "Không tải được thumbnail video Zalo:",
              thumbnailError
            );

            importIssues.push({
              level:
                "warning",

              stage:
                "thumbnail",

              index: i,

              message:
                getErrorMessage(
                  thumbnailError
                ),

              sourceUrl:
                rawThumbnailUrl ||
                null,
            });
          }
        }

        uploadedVideos.push({
          batch_id:
            batchId,

          temp_r2_key:
            uploadedVideo.key,

          temp_video_url:
            uploadedVideo.url,

          temp_thumb_r2_key:
            uploadedThumb
              ?.key || null,

          temp_thumb_url:
            uploadedThumb
              ?.url || null,

          source_url:
            sourceUrl,

          source_thumb_url:
            rawThumbnailUrl ||
            null,

          mime_type:
            downloadedVideo
              .contentType,

          size_bytes:
            downloadedVideo
              .buffer.length,

          duration_ms:
            toPositiveInt(
              video.durationMs
            ),

          width:
            toPositiveInt(
              video.width
            ),

          height:
            toPositiveInt(
              video.height
            ),

          selected: true,
          sort_order: i,
        });
      } catch (error) {
        importIssues.push({
          level: "error",
          stage: "video",
          code: videoFailureCode,
          index: i,

          message:
            getErrorMessage(
              error
            ),

          sourceUrl:
            rawSourceUrl ||
            null,
        });

        console.error(
          `Video ${i + 1} import lỗi:`,
          error
        );
      }
    }

    if (
      uploadedVideos.length >
      0
    ) {
      stage = "video-insert";

      const videoInsertPayload =
        makePostgrestPayload(
          uploadedVideos,
          "zalo_import_videos.insert"
        );

      const videoInsert =
        officialReader ? { error: null } : await supabase
          .from(
            "zalo_import_videos"
          )
          .insert(
            videoInsertPayload
          );

      if (
        videoInsert.error
      ) {
        importIssues.push({
          level: "error",
          stage:
            "database",
          code: "VIDEO_DATABASE_LINK_FAILED",

          index: null,

          message:
            [
              "Không ghi được danh sách video vào database.",
              getErrorMessage(
                videoInsert.error
              ),
            ].join(" "),
        });

        uploadedVideos.splice(
          0,
          uploadedVideos.length
        );
      }
    }

    if (
      uploadedImages.length !==
      expectedImageCount
    ) {
      importIssues.push({
        level: "error",
        stage: "media",
        index: null,

        message: [
          "Số ảnh import không đầy đủ.",
          `Dự kiến ${expectedImageCount},`,
          `đã lưu ${uploadedImages.length}.`,
        ].join(" "),
      });
    }

    if (
      uploadedVideos.length !==
      expectedVideoCount
    ) {
      importIssues.push({
        level: "error",
        stage: "media",
        index: null,

        message: [
          "Số video import không đầy đủ.",
          `Dự kiến ${expectedVideoCount},`,
          `đã lưu ${uploadedVideos.length}.`,
        ].join(" "),
      });
    }

    // A verified room anchor followed by an identified video can remain a
    // manual-review draft even when Zalo has not supplied a usable video URL.
    const manualVideoRequired = officialReader && !officialTrial && expectedImageCount === 0 && expectedVideoCount > 0 &&
      uploadedImages.length === 0 && uploadedVideos.length === 0 &&
      Array.isArray(body.videoSourceMessageIds) && body.videoSourceMessageIds.some((id:unknown)=>typeof id==="string" && /^[A-Za-z0-9:_-]{1,128}$/.test(id)) &&
      Boolean(parsed.roomPayload.room_code && parsed.roomPayload.room_type && Number(parsed.roomPayload.price)>0);
    if(manualVideoRequired) importIssues.push({level:"error",stage:"video",code:"VIDEO_MANUAL_UPLOAD_REQUIRED",index:null,
      message:"Tin phòng chỉ có video nhưng Reader chưa tải được. Mở Chỉnh sửa để thêm video thủ công trước khi duyệt đăng."});

    const hasImportErrors =
      importIssues.some(
        (issue) =>
          issue.level ===
          "error"
      );

    if (testImportToPending && uploadedImages.length === 0 && uploadedVideos.length === 0) {
      return NextResponse.json({
        ok: false, code: "TEST_NO_VALID_MEDIA", testImportToPending: true, error: "TEST_NO_VALID_MEDIA: Không lưu được ảnh/video hợp lệ; không tạo hoặc ghi đè Pending test.",
        issues: importIssues, imageCount: 0, videoCount: 0,
        mediaProgress: { imagesUploaded, videosDownloaded, videosUploaded },
      }, { status: 422 });
    }

    const importDiagnostics =
      {
        manual_video_required: manualVideoRequired,
        video_source_message_ids: Array.isArray(body.videoSourceMessageIds) ? body.videoSourceMessageIds.filter((id:unknown)=>typeof id==="string" && /^[A-Za-z0-9:_-]{1,128}$/.test(id)).slice(0,20) : [],
        album_expected_images: Number.isInteger(body.albumExpectedImageCount) && body.albumExpectedImageCount>0 ? body.albumExpectedImageCount : null,
        media_verification: Number.isInteger(body.albumExpectedImageCount) && body.albumExpectedImageCount>uploadedImages.length ? "MEDIA_INCOMPLETE"
          : body.mediaVerification === "VERIFIED" && body.albumExpectedImageCount===uploadedImages.length && uploadedImages.length>0 && !hasImportErrors ? "VERIFIED" : "MEDIA_UNVERIFIED",
        has_errors:
          hasImportErrors,

        issue_count:
          importIssues.length,

        expected: {
          images:
            expectedImageCount,

          videos:
            expectedVideoCount,
        },

        received: {
          images:
            images.length,

          videos:
            videos.length,
        },

        imported: {
          images:
            uploadedImages.length,

          videos:
            uploadedVideos.length,
        },

        issues:
          importIssues,
      };

    const autoImportSettings =
      readZaloAutoImportSettings(
        groupName
      );

    const importQuality =
      evaluateZaloImportQuality({
        roomPayload:
          resolved.roomPayload,

        detailPayload:
          resolved.detailPayload,

        sourceFieldMap:
          parsed.sourceFieldMap,

        inheritedFieldMap:
          resolved.inheritedFieldMap,

        matchedRoom:
          resolved.matchedRoom,

        importIssues,

        expectedImageCount,
        expectedVideoCount,

        importedImageCount:
          uploadedImages.length,

        importedVideoCount:
          uploadedVideos.length,

        groupName,
        settings:
          autoImportSettings,
      });

    const existingMedia =
      Array.isArray(
        (
          resolved.roomPayload as any
        )?.media
      )
        ? (
            resolved.roomPayload as any
          ).media
        : [];

    const pendingMedia = [
      ...existingMedia,

      ...uploadedVideos.map(
        (video) => ({
          type:
            "video",

          provider:
            "r2",

          url:
            video.temp_video_url,

          thumb:
            video.temp_thumb_url,

          temp_r2_key:
            video.temp_r2_key,

          temp_thumb_r2_key:
            video.temp_thumb_r2_key,

          duration_ms:
            video.duration_ms,

          width:
            video.width,

          height:
            video.height,

          size_bytes:
            video.size_bytes,
        })
      ),
    ];

    const errorSummary =
      importIssues
        .filter(
          (issue) =>
            issue.level ===
            "error"
        )
        .map(
          (issue) =>
            `[${issue.stage}] ${issue.message}`
        )
        .join("\n");

    const pendingRoomPayload =
      {
        ...(testImportToPending || officialTrial ? { is_test_import: true, test_source_message_id: sourceMessageId } : {}),
        ...resolved.roomPayload,
        ...(officialReader ? { _reader_manual_review: true } : {}),
        ...(manualVideoRequired ? { _manual_video_required: true } : {}),
        ...(roomReview ? { _room_import: { ...roomReview, image_hashes: imageHashes, video_hashes: videoHashes } } : {}),

        media:
          pendingMedia,

        has_video:
          uploadedVideos.length >
          0,

        video_url:
          uploadedVideos[0]
            ?.temp_video_url ??
          null,

        video_urls:
          uploadedVideos.map(
            (video) =>
              video.temp_video_url
          ),

        thumb_url:
          uploadedVideos[0]
            ?.temp_thumb_url ??
          null,

        import_has_errors:
          hasImportErrors,

        import_error_summary:
          errorSummary || null,

        import_diagnostics:
          importDiagnostics,

        import_quality:
          importQuality,
      };

    const batchParserResult =
      {
        ...(officialIdentity ? { official_source: officialIdentity.metadata } : {}),
        ...(testImportToPending || officialTrial ? { test_import: true } : {}),
        staging_trial: stagingOnly,
        staging_group_id: stagingOnly ? sourceGroupId : null,
        room_payload:
          pendingRoomPayload,

        detail_payload:
          resolved.detailPayload,

        source_field_map:
          parsed.sourceFieldMap,

        inherited_field_map:
          resolved.inheritedFieldMap,

        matched_room_id:
          resolved.matchedRoom
            ?.id ?? null,

        matched_reason:
          resolved.matchedReason ||
          null,

        import_diagnostics:
          importDiagnostics,

        import_quality:
          importQuality,

        imported_media: {
          image_count:
            uploadedImages.length,

          video_count:
            uploadedVideos.length,

          images:
            uploadedImages.map(
              (image) => ({
                url:
                  image.temp_image_url,

                mime_type:
                  image.mime_type,

                size_bytes:
                  image.size_bytes,

                sort_order:
                  image.sort_order,
              })
            ),

          videos:
            uploadedVideos.map(
              (video, index) => ({
                source_message_id:
                  String(videos[index]?.messageId || "").trim() || null,
                url:
                  video.temp_video_url,

                thumb_url:
                  video.temp_thumb_url,

                duration_ms:
                  video.duration_ms,

                width:
                  video.width,

                height:
                  video.height,

                size_bytes:
                  video.size_bytes,
              })
            ),
        },
      };

    stage = "batch-update";

    const batchUpdatePayload =
      makePostgrestPayload(
        {
          ...(testIdentity ? { raw_text: rawText, sent_at: sentAt } : {}),
          parser_result:
            batchParserResult,
        },
        "zalo_import_batches.update"
      );

    const batchUpdate =
      officialReader ? { error: null } : await supabase
        .from(
          "zalo_import_batches"
        )
        .update(
          batchUpdatePayload
        )
        .eq(
          "id",
          batchId
        );

    if (
      batchUpdate.error
    ) {
      throw batchUpdate.error;
    }

    stage = "pending-insert";

    const pendingInsertPayload =
      makePostgrestPayload(
        {
          ...(officialIdentity ? { id: officialIdentity.pendingId } : testIdentity ? { id: testIdentity.pendingId } : {}),
          batch_id:
            batchId,

          status:
            !testImportToPending && !officialReader && resolved.matchedRoom
              ? "Trùng phòng"
              : "Chờ duyệt",

          confidence_score:
            importQuality.score_fraction,

          room_payload:
            pendingRoomPayload,

          detail_payload:
            resolved.detailPayload,

          source_field_map:
            parsed.sourceFieldMap,

          inherited_field_map:
            resolved.inheritedFieldMap,

          matched_room_id:
            resolved.matchedRoom
              ?.id ?? null,

          matched_reason:
            resolved.matchedReason ||
            null,

          old_status:
            resolved.matchedRoom
              ?.status ?? null,

          new_status:
            resolved.matchedRoom
              ? resolved.roomPayload
                  .status ?? null
              : null,
          ...(officialReader || stagingOnly || roomReview?.type !== "CREATE"
            ? {
                auto_approve_enabled: false,
                auto_approve_at: null,
                auto_approve_actor_id: null,
              }
            : {}),
        },
        "pending_room_versions.insert"
      );

    if (officialIdentity) {
      // Keep all database links atomic. A batch alone is never a checkpoint receipt.
        if (!uploadedImages.length && !uploadedVideos.length && !manualVideoRequired) {
        return NextResponse.json({ ok: false, code: "NO_USABLE_MEDIA", issues: importIssues.map(issue => ({ level: issue.level, stage: issue.stage, code: issue.code })), mediaProgress: { imagesUploaded, videosDownloaded, videosUploaded } }, { status: 422 });
      }
      const finalized = await supabase.rpc("finalize_zalo_official_source_v1", {
        p_batch: { ...batchInsertPayload, parser_result: batchParserResult }, p_pending: pendingInsertPayload,
        p_images: uploadedImages, p_videos: uploadedVideos, p_run_id: officialIdentity.metadata.run_id,
      });
      if (finalized.error) throw finalized.error;
      if (!finalized.data?.pending_id) throw new Error("OFFICIAL_RECEIPT_MISSING");
      return NextResponse.json({ ok: true, duplicate: !finalized.data.created, batchId,
        pendingVersionId: finalized.data.pending_id, importType: roomReview?.type || "NEEDS_REVIEW",
          status: "Chờ duyệt", officialTrial, imageCount: uploadedImages.length, videoCount: uploadedVideos.length, manualVideoRequired,
        partial: hasImportErrors, hasImportErrors, issues: importIssues, autoPublished: false,
        mediaVerification: importDiagnostics.media_verification,
        mediaProgress: { imagesUploaded, videosDownloaded, videosUploaded } });
    }
    const pendingWrite = supabase.from("pending_room_versions");
    const pendingIns = testIdentity && testPendingExists
      ? await pendingWrite.update(pendingInsertPayload)
          .eq("id", testIdentity.pendingId).eq("batch_id", testIdentity.batchId)
          .eq("status", "Chờ duyệt").eq("room_payload->>is_test_import", "true")
          .select("id").single()
      : await supabase
        .from(
          "pending_room_versions"
        )
        .insert(
          pendingInsertPayload
        )
        .select("id")
        .single();

    if (
      pendingIns.error
    ) {
      throw pendingIns.error;
    }

    const pendingVersionId =
      String(
        pendingIns.data.id
      );

    if (testIdentity) {
      // Remove only media rows belonging to the previous revision of this test batch.
      for (const [table, rows] of [["zalo_import_images", oldTestImages], ["zalo_import_videos", oldTestVideos]] as const) {
        if (rows.length) {
          const cleanup = await supabase.from(table).delete().eq("batch_id", testIdentity.batchId).in("id", rows.map((row) => row.id));
          if (cleanup.error) throw cleanup.error;
        }
      }
      const oldKeys = [...oldTestImages, ...oldTestVideos].flatMap((row) => [row.temp_r2_key, row.temp_thumb_r2_key]).filter(Boolean);
      if (oldKeys.length) {
        try { await deleteR2Keys(oldKeys); }
        catch {
          importIssues.push({ level: "warning", stage: "media", index: null, code: "TEST_MEDIA_CLEANUP_FAILED", message: "Pending test đã cập nhật; chưa dọn hết media tạm của phiên bản test cũ." });
        }
      }
    }

    let autoPublished = false;
    let autoPublishedRoomId:
      string | null = null;
    let autoPublishError:
      string | null = null;

    if (
      !testImportToPending && shouldAutoPublishZaloImport({
        stagingOnly,
        eligible: importQuality.eligible,
        enabled: autoImportSettings.enabled,
        dryRun: autoImportSettings.dryRun,
      }) && roomReview?.type === "CREATE"
    ) {
      try {
        const published =
          await publishPendingRoom({
            pendingId:
              pendingVersionId,

            actorUserId:
              autoImportSettings.ownerId,

            source: "auto",
            supabase,
          });

        autoPublished = true;
        autoPublishedRoomId =
          published.roomId;

        importQuality.auto_import.published =
          true;

        importQuality.auto_import.published_room_id =
          published.roomId;
      } catch (publishError) {
        autoPublishError =
          getErrorMessage(
            publishError
          );

        importQuality.auto_import.publish_error =
          autoPublishError;

        const failedRoomPayload = {
          ...pendingRoomPayload,
          import_quality:
            importQuality,
        };

        const failedParserResult = {
          ...batchParserResult,
          room_payload:
            failedRoomPayload,
          import_quality:
            importQuality,
        };

        await Promise.allSettled([
          supabase
            .from(
              "pending_room_versions"
            )
            .update({
              room_payload:
                failedRoomPayload,
            })
            .eq(
              "id",
              pendingVersionId
            ),

          supabase
            .from(
              "zalo_import_batches"
            )
            .update({
              parser_result:
                failedParserResult,
            })
            .eq(
              "id",
              batchId
            ),
        ]);

        console.error(
          "Auto publish Zalo import failed:",
          {
            pendingVersionId,
            batchId,
            error:
              autoPublishError,
          }
        );
      }
    }

    stage = "response";

    return NextResponse.json({
      ok: true,
      duplicate: false,
      stagingOnly,

      partial:
        hasImportErrors,

      hasImportErrors,

      batchId,

      pendingVersionId,
      ...(testImportToPending ? { testPendingAction: testPendingExists ? "updated" : "created", testImportToPending: true } : {}),

      mediaProgress: { imagesUploaded, videosDownloaded, videosUploaded },

      imageCount:
        uploadedImages.length,

      videoCount:
        uploadedVideos.length,

      expectedImageCount,

      expectedVideoCount,

      issues:
        importIssues,

      quality:
        importQuality,

      autoImport: {
        eligible:
          importQuality.eligible,

        enabled:
          autoImportSettings.enabled,

        dryRun:
          autoImportSettings.dryRun,

        published:
          autoPublished,

        roomId:
          autoPublishedRoomId,

        error:
          autoPublishError,
      },

      videoUrls:
        uploadedVideos.map(
          (video) =>
            video.temp_video_url
        ),
    });
  } catch (error) {
    const errorDetails =
      getErrorDetails(error);

    console.error(
      "zalo-reader import failed:",
      {
        stage,
        sourceHash:
          currentSourceHash,
        sourceMessageId:
          currentSourceMessageId,
        error:
          getErrorMessage(error),
        errorDetails,
      }
    );

    return NextResponse.json(
      {
        ok: false,

        stage,

        sourceHash:
          currentSourceHash,

        sourceMessageId:
          currentSourceMessageId,

        error:
          getErrorMessage(
            error
          ) ||
          "Import failed",

        errorDetails,
      },
      {
        status: 500,
      }
    );
  }
}
