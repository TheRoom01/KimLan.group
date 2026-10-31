// @ts-ignore Node built-in type is available in the project runtime.
import assert from "node:assert/strict";
import {
  assertStagingImportApiAvailable,
  buildStagingRoomContent,
  resolveStagingImportEndpoint,
  STAGING_API_IMPORT_TIMEOUT_MS,
  STAGING_API_PREFLIGHT_TIMEOUT_MS,
  StagingImportTransportError,
} from "../../../lib/zalo-reader/staging-import-transport";

async function main() {
  assert.equal(STAGING_API_PREFLIGHT_TIMEOUT_MS, 30_000);
  assert.equal(STAGING_API_IMPORT_TIMEOUT_MS, 180_000);
  assert.equal(
    resolveStagingImportEndpoint("http://127.0.0.1:3000/"),
    "http://127.0.0.1:3000/api/internal/zalo-reader/import",
  );
  assert.equal(
    resolveStagingImportEndpoint("http://localhost:3000"),
    "http://127.0.0.1:3000/api/internal/zalo-reader/import",
  );
  assert.throws(() => resolveStagingImportEndpoint("https://canhodichvu.pro"));

  const content = buildStagingRoomContent({
    fullText: "",
    houseInfoText: "Địa chỉ: 1 Nguyễn Huệ",
    markerText: "P04 - Lầu 2 - 9.000.000",
    descriptionTexts: ["Có máy lạnh", "Có máy lạnh"],
    imageUrls: ["https://media.test/a.jpg", "https://media.test/a.jpg"],
  });
  assert.equal(
    content.rawText,
    "Địa chỉ: 1 Nguyễn Huệ\n\nP04 - Lầu 2 - 9.000.000\n\nCó máy lạnh",
  );
  assert.deepEqual(content.imageUrls, ["https://media.test/a.jpg"]);

  const empty = buildStagingRoomContent({ fullText: "", imageUrls: [] });
  assert.equal(empty.rawText, "");
  assert.deepEqual(empty.imageUrls, []);

  await assertStagingImportApiAvailable(
    "http://127.0.0.1:3000/api/internal/zalo-reader/import",
    async (_input, init) => {
      assert.equal(init?.method, "GET");
      return new Response(null, { status: 405 });
    },
  );

  await assert.rejects(
    () =>
      assertStagingImportApiAvailable(
        "http://127.0.0.1:3000/api/internal/zalo-reader/import",
        async () => {
          throw new TypeError("fetch failed", {
            cause: Object.assign(new Error("connect ECONNREFUSED"), {
              code: "ECONNREFUSED",
            }),
          });
        },
      ),
    (error: unknown) =>
      error instanceof StagingImportTransportError &&
      error.message.includes("ECONNREFUSED") &&
      error.message.includes("Chưa gửi phòng hoặc tải media"),
  );

  console.log("Staging import transport tests: all passed");
}

void main();
