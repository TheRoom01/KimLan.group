import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const scriptPath = fileURLToPath(import.meta.url);
const readerDir = path.dirname(scriptPath);
const readerPath = path.join(readerDir, "zalo-reader.ts");
const backupPath = path.join(
  readerDir,
  "zalo-reader.before-semantic-parser.ts"
);

if (!fs.existsSync(readerPath)) {
  throw new Error(`Không tìm thấy Reader: ${readerPath}`);
}

let source = fs.readFileSync(readerPath, "utf8");
const newline = source.includes("\r\n") ? "\r\n" : "\n";

if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(readerPath, backupPath);
  console.log(`Đã tạo backup: ${backupPath}`);
} else {
  console.log(`Backup đã tồn tại, không ghi đè: ${backupPath}`);
}

const parserImport =
  'import { buildSemanticTimelineRooms } from "./parsers/semantic-timeline";';

if (!source.includes(parserImport)) {
  const urlImport =
    'import { fileURLToPath, pathToFileURL } from "url";';

  const importIndex = source.indexOf(urlImport);
  if (importIndex < 0) {
    throw new Error(
      "Không tìm thấy import từ url để chèn semantic parser. Reader có thể đã thay đổi cấu trúc."
    );
  }

  const insertionPoint = importIndex + urlImport.length;
  source =
    source.slice(0, insertionPoint) +
    newline +
    parserImport +
    source.slice(insertionPoint);
}

const writeFunctionIndex = source.indexOf(
  "function writeIndexedDbRoomPreview("
);

if (writeFunctionIndex < 0) {
  throw new Error(
    "Không tìm thấy writeIndexedDbRoomPreview trong zalo-reader.ts"
  );
}

const builtRoomsStart = source.indexOf(
  "  const builtRooms =",
  writeFunctionIndex
);

const newestVersionsMarker = `${newline}${newline}  const newestRoomVersions =`;
const builtRoomsEnd = source.indexOf(
  newestVersionsMarker,
  builtRoomsStart
);

if (builtRoomsStart < 0 || builtRoomsEnd < 0) {
  throw new Error(
    "Không tìm thấy block buildRooms hiện tại để thay thế. Không có file nào bị ghi đè."
  );
}

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
  "  const parserOptions =",
  '    rawGroupEntry && typeof rawGroupEntry === "object"',
  "      ? (rawGroupEntry as any).parserOptions",
  "      : undefined;",
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

const replacement = replacementLines.join(newline);
const currentBlock = source.slice(builtRoomsStart, builtRoomsEnd);

if (!currentBlock.includes("buildSemanticTimelineRooms")) {
  source =
    source.slice(0, builtRoomsStart) +
    replacement +
    source.slice(builtRoomsEnd);
}

fs.writeFileSync(readerPath, source, "utf8");

const finalSource = fs.readFileSync(readerPath, "utf8");
const checks = [
  parserImport,
  "const rawGroupEntry =",
  "buildSemanticTimelineRooms({",
  'parserName === "legacy"',
];

const missing = checks.filter((value) => !finalSource.includes(value));
if (missing.length > 0) {
  throw new Error(
    `Patch chưa hoàn chỉnh. Thiếu: ${missing.join(", ")}`
  );
}

console.log("Đã patch thành công tools/zalo-reader/zalo-reader.ts");
console.log(
  "Parser semantic-timeline đã được bật; đặt parser=legacy trong config để quay lại logic cũ cho riêng một nhóm."
);
