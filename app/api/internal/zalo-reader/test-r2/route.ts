import { NextResponse } from "next/server";
import {
  deleteR2Object,
  makeZaloTempImageKey,
  uploadBufferToR2,
} from "@/lib/r2/zalo-temp";

export const runtime = "nodejs";

function checkSecret(req: Request) {
  const expected = process.env.ZALO_READER_INTERNAL_SECRET || "";
  const got = req.headers.get("x-internal-secret") || "";

  return Boolean(expected && got && expected === got);
}

export async function POST(req: Request) {
  try {
    if (!checkSecret(req)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const batchId = crypto.randomUUID();
    const imageId = crypto.randomUUID();

    const key = makeZaloTempImageKey(batchId, imageId, "txt");

    const text = [
      "Zalo Reader R2 temp test",
      `batchId=${batchId}`,
      `imageId=${imageId}`,
      `createdAt=${new Date().toISOString()}`,
    ].join("\n");

    const uploaded = await uploadBufferToR2({
      key,
      buffer: Buffer.from(text, "utf8"),
      contentType: "text/plain; charset=utf-8",
      cacheControl: "public, max-age=60",
    });

    let deleted = false;

    if (String(req.headers.get("x-delete-after-test") || "") === "1") {
      await deleteR2Object(key);
      deleted = true;
    }

    return NextResponse.json({
      ok: true,
      batchId,
      imageId,
      key: uploaded.key,
      url: uploaded.url,
      deleted,
    });
  } catch (e: any) {
    console.error("test-r2 failed:", e);

    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "test-r2 failed",
      },
      { status: 500 }
    );
  }
}