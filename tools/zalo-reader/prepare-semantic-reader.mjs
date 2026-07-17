import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const scriptPath = fileURLToPath(import.meta.url);
const readerDirectory = path.dirname(scriptPath);

const sourceReaderPath = path.join(
  readerDirectory,
  "zalo-reader.before-semantic-parser.ts"
);

const runtimeReaderPath = path.join(
  readerDirectory,
  ".zalo-reader.semantic-runtime.ts"
);

if (!fs.existsSync(sourceReaderPath)) {
  throw new Error(
    `Không tìm thấy Reader nguồn: ${sourceReaderPath}`
  );
}

let source = fs.readFileSync(
  sourceReaderPath,
  "utf8"
);

const newline = source.includes("\r\n")
  ? "\r\n"
  : "\n";

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
    `${urlImport}${newline}${parserImport}`
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
  `${newline}${newline}  const newestRoomVersions =`,
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
  const replacementLines = [
    "  const rawGroupEntry =",
    "    params.config.groups.find((entry) => {",
    '      if (typeof entry === "string") {',
    "        return entry.trim() === params.groupName;",
    "      }",
    "",
    "      return (",
    '        String((entry as any)?.name || "").trim() ===',
    "        params.groupName",
    "      );",
    "    });",
    "",
    "  const parserName =",
    '    rawGroupEntry && typeof rawGroupEntry === "object"',
    '      ? String((rawGroupEntry as any).parser || "semantic-timeline")',
    '      : "semantic-timeline";',
    "",
    "  const configuredParserOptions =",
    '    rawGroupEntry && typeof rawGroupEntry === "object"',
    "      ? (rawGroupEntry as any).parserOptions",
    "      : undefined;",
    "",
    "  const parserOptions = {",
    '    buildingBoundary: "address-or-separator",',
    "    ...(configuredParserOptions || {}),",
    "  };",
    "",
    "  console.log(",
    "    [",
    '      "Parser phòng:",',
    "      parserName,",
    '      `(${params.groupName})`,',
    '    ].join(" ")',
    "  );",
    "",
    "  const builtRooms: IndexedDbRoomPreview[] =",
    '    parserName === "legacy"',
    "      ? buildRoomsFromIndexedDbMessages({",
    "          groupName: params.groupName,",
    "          groupId: params.groupId,",
    "          messages: params.messages,",
    "          maxGapMs,",
    "        })",
    "      : (buildSemanticTimelineRooms({",
    "          groupName: params.groupName,",
    "          groupId: params.groupId,",
    "          messages: params.messages as any,",
    "          maxGapMs,",
    "          parserOptions,",
    "        }) as IndexedDbRoomPreview[]);",
  ];

  const replacement =
    replacementLines.join(newline);

  source =
    source.slice(0, builtRoomsStart) +
    replacement +
    source.slice(builtRoomsEnd);
}

const requiredTokens = [
  parserImport,
  "const rawGroupEntry =",
  "buildSemanticTimelineRooms({",
  "parserOptions,",
];

const missingTokens = requiredTokens.filter(
  (token) => !source.includes(token)
);

if (missingTokens.length > 0) {
  throw new Error(
    `Runtime Reader chưa được chuẩn bị đầy đủ. Thiếu: ${missingTokens.join(", ")}`
  );
}

fs.writeFileSync(
  runtimeReaderPath,
  source,
  "utf8"
);

console.log(
  `Đã chuẩn bị semantic Zalo Reader: ${runtimeReaderPath}`
);
