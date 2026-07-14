const fs = require("node:fs");
const path = require("node:path");

const parserPath = path.join(
  process.cwd(),
  "lib/zalo-import/parser.ts"
);

let source = fs.readFileSync(parserPath, "utf8");
let changed = false;

// Some Zalo posts use F12 / F.12 as shorthand for Phường 12.
const wardAnchor = '    "p(?:\\\\.|(?=\\\\s|\\\\d))|" +\n';
const wardAlias = '    "f(?:\\\\.|(?=\\\\s|\\\\d))|" +\n';

if (!source.includes(wardAlias)) {
  if (!source.includes(wardAnchor)) {
    throw new Error("Không tìm thấy vị trí khai báo nhãn phường trong parser.ts");
  }

  source = source.replaceAll(
    wardAnchor,
    wardAnchor + wardAlias
  );
  changed = true;
}

// Compact address headers may use underscores as separators:
// 413/8 Lê Văn Sỹ_F12_ Quận 3
const functionAnchor = "  function analyzeLocationTail(";
const functionIndex = source.indexOf(functionAnchor);

if (functionIndex < 0) {
  throw new Error("Không tìm thấy analyzeLocationTail trong parser.ts");
}

const newlineAnchor = '        .replace(/\\r\\n?/g, "\\n")\n';
const newlineIndex = source.indexOf(newlineAnchor, functionIndex);

if (newlineIndex < 0) {
  throw new Error("Không tìm thấy bước chuẩn hóa xuống dòng trong analyzeLocationTail");
}

const underscoreLine = '        .replace(/_+/g, ", ")\n';
const nearbySource = source.slice(
  functionIndex,
  newlineIndex + newlineAnchor.length + 200
);

if (!nearbySource.includes(underscoreLine)) {
  const insertIndex = newlineIndex + newlineAnchor.length;
  source =
    source.slice(0, insertIndex) +
    underscoreLine +
    source.slice(insertIndex);
  changed = true;
}

if (changed) {
  fs.writeFileSync(parserPath, source, "utf8");
  console.log("Đã cập nhật parser địa chỉ Zalo: hỗ trợ dấu _ và F12/F.12.");
} else {
  console.log("Parser địa chỉ Zalo đã được cập nhật trước đó.");
}
