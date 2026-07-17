import fs from "fs";
import path from "path";
import {
  fileURLToPath,
  pathToFileURL,
} from "url";

export {
  buildSemanticTimelineRooms,
} from "./parsers";

const readerDirectory = path.dirname(
  fileURLToPath(import.meta.url)
);

const sourceReaderPath = path.join(
  readerDirectory,
  "zalo-reader.before-semantic-parser.ts"
);

const runtimeReaderPath = path.join(
  readerDirectory,
  ".zalo-reader.semantic-runtime.ts"
);

function buildSemanticReaderSource(
  originalSource: string
) {
  let source = originalSource;

  const parserImport =
    'import { buildSemanticTimelineRooms } from "./parsers";';

  const urlImport =
    'import { fileURLToPath, pathToFileURL } from "url";';

  if (!source.includes(parserImport)) {
    if (!source.includes(urlImport)) {
      throw new Error(
        "Không tìm thấy vị trí chèn semantic parser trong Zalo Reader."
      );
    }

    source = source.replace(
      urlImport,
      `${urlImport}\n${parserImport}`
    );
  }

  const writeFunctionIndex = source.indexOf(
    "function writeIndexedDbRoomPreview("
  );

  if (writeFunctionIndex < 0) {
    throw new Error(
      "Không tìm thấy writeIndexedDbRoomPreview trong Zalo Reader."
    );
  }

  const builtRoomsStart = source.indexOf(
    "  const builtRooms =",
    writeFunctionIndex
  );

  const builtRoomsEnd = source.indexOf(
    "\n\n  const newestRoomVersions =",
    builtRoomsStart
  );

  if (
    builtRoomsStart < 0 ||
    builtRoomsEnd < 0
  ) {
    throw new Error(
      "Không tìm thấy block parser phòng trong Zalo Reader."
    );
  }

  const currentBlock = source.slice(
    builtRoomsStart,
    builtRoomsEnd
  );

  if (
    !currentBlock.includes(
      "buildSemanticTimelineRooms({"
    )
  ) {
    const replacement = `  const rawGroupEntry =
    params.config.groups.find((entry) => {
      if (typeof entry === "string") {
        return entry.trim() === params.groupName;
      }

      return (
        String((entry as any)?.name || "").trim() ===
        params.groupName
      );
    });

  const parserName =
    rawGroupEntry && typeof rawGroupEntry === "object"
      ? String((rawGroupEntry as any).parser || "semantic-timeline")
      : "semantic-timeline";

  const configuredParserOptions =
    rawGroupEntry && typeof rawGroupEntry === "object"
      ? (rawGroupEntry as any).parserOptions
      : undefined;

  const parserOptions = {
    buildingBoundary: "address-or-separator",
    ...(configuredParserOptions || {}),
  };

  console.log(
    [
      "Parser phòng:",
      parserName,
      \`(\${params.groupName})\`,
    ].join(" ")
  );

  const builtRooms: IndexedDbRoomPreview[] =
    parserName === "legacy"
      ? buildRoomsFromIndexedDbMessages({
          groupName: params.groupName,
          groupId: params.groupId,
          messages: params.messages,
          maxGapMs,
        })
      : (buildSemanticTimelineRooms({
          groupName: params.groupName,
          groupId: params.groupId,
          messages: params.messages as any,
          maxGapMs,
          parserOptions,
        }) as IndexedDbRoomPreview[]);`;

    source =
      source.slice(0, builtRoomsStart) +
      replacement +
      source.slice(builtRoomsEnd);
  }

  return source;
}

const originalSource = fs.readFileSync(
  sourceReaderPath,
  "utf8"
);

const runtimeSource =
  buildSemanticReaderSource(originalSource);

fs.writeFileSync(
  runtimeReaderPath,
  runtimeSource,
  "utf8"
);

void import(
  `${pathToFileURL(runtimeReaderPath).href}?v=${Date.now()}`
).catch((error) => {
  console.error(
    "Không thể khởi động Zalo Reader semantic:",
    error
  );

  process.exit(1);
});
