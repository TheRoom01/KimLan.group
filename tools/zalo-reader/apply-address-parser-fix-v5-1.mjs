import fs from "fs";
import path from "path";

const ROOT = process.cwd();

const TARGET = path.join(
  ROOT,
  "lib/zalo-import/parser.ts"
);

const BACKUP = path.join(
  ROOT,
  "lib/zalo-import/parser.before-address-v5.ts"
);

const PATCH_MARKER =
  "ADDRESS_PARSER_V5_1_INLINE_BUILDING_HEADER";

if (!fs.existsSync(TARGET)) {
  throw new Error(
    `Không tìm thấy file: ${TARGET}`
  );
}

let source = fs.readFileSync(
  TARGET,
  "utf8"
);

if (source.includes(PATCH_MARKER)) {
  console.log(
    "Address Parser V5.1 đã được áp dụng trước đó."
  );
  process.exit(0);
}

/*
 * Script V5 cũ dừng trước fs.writeFileSync(),
 * nên parser.ts không bị sửa dở.
 *
 * Giữ backup đã có; nếu chưa có mới tạo.
 */
if (!fs.existsSync(BACKUP)) {
  fs.copyFileSync(
    TARGET,
    BACKUP
  );

  console.log(
    `Đã sao lưu parser cũ: ${BACKUP}`
  );
} else {
  console.log(
    `Đã có backup: ${BACKUP}`
  );
}

function replaceExactlyOnce(
  input,
  pattern,
  replacement,
  errorMessage
) {
  const matches =
    typeof pattern === "string"
      ? input.split(pattern).length - 1
      : Array.from(
          input.matchAll(
            new RegExp(
              pattern.source,
              pattern.flags.includes("g")
                ? pattern.flags
                : pattern.flags + "g"
            )
          )
        ).length;

  if (matches !== 1) {
    throw new Error(
      `${errorMessage} Số vị trí tìm thấy: ${matches}.`
    );
  }

  return input.replace(
    pattern,
    replacement
  );
}

const extractStart =
  source.indexOf(
    "function extractAddressParts("
  );

if (extractStart < 0) {
  throw new Error(
    "Không tìm thấy hàm extractAddressParts()."
  );
}

const detectStart =
  source.indexOf(
    "export function detectZaloBuildingCandidates("
  );

if (detectStart < 0) {
  throw new Error(
    "Không tìm thấy hàm detectZaloBuildingCandidates()."
  );
}

let extractScope =
  source.slice(
    extractStart,
    detectStart
  );

/*
 * =========================================================
 * 1. THÊM RULE TIÊU ĐỀ TÒA NHÀ CÓ ĐỊA CHỈ CÙNG DÒNG
 * =========================================================
 */
const houseNumberAnchor =
  /\n(\s*)const houseNumberSource\s*=/;

const houseNumberAnchorMatch =
  extractScope.match(
    houseNumberAnchor
  );

if (!houseNumberAnchorMatch) {
  throw new Error(
    "Không tìm thấy const houseNumberSource trong extractAddressParts()."
  );
}

const indent =
  houseNumberAnchorMatch[1] ||
  "  ";

const prefixRule = `

${indent}/*
${indent} * ${PATCH_MARKER}
${indent} *
${indent} * Hỗ trợ:
${indent} * DỰ ÁN DUY TRÌ: 517/18 Nguyễn Trãi, P An Đông Q5
${indent} * CẬP NHẬT DỰ ÁN DUY TRÌ: địa chỉ 1186 Võ Văn Kiệt
${indent} * HIFRIENDZ THÔNG BÁO DỰ ÁN DUY TRÌ QUẬN 3: 413/8 Lê Văn Sỹ
${indent} */
${indent}const buildingAnnouncementPrefixPattern =
${indent}  /^(?:(?:hifriendz\\s*)?(?:(?:thông\\s*báo|thong\\s*bao|cập\\s*nhật|cap\\s*nhat|khai\\s*trương|khai\\s*truong|mở\\s*bán|mo\\s*ban)\\s+)?(?:dự\\s*án|du\\s*an|chdv|căn\\s*hộ\\s*dịch\\s*vụ|can\\s*ho\\s*dich\\s*vu|tòa\\s*nhà|toa\\s*nha)(?:\\s+(?:mới|moi|duy\\s*trì|duy\\s*tri|cao\\s*cấp|cao\\s*cap))*(?:\\s+(?:q(?:uận)?|quan)\\.?\\s*\\d{1,2})?\\s*[:\\-–—]\\s*)/i;
`;

extractScope =
  replaceExactlyOnce(
    extractScope,
    houseNumberAnchor,
    `${prefixRule}\n$&`,
    "Không thể chèn buildingAnnouncementPrefixPattern."
  );

/*
 * =========================================================
 * 2. SỬA parseAddressCandidate()
 * =========================================================
 *
 * Không dựa vào dòng trống hay format Prettier.
 * Chỉ tìm lần `.trim();` đầu tiên bên trong phần khởi tạo candidate.
 */
const parseCandidateStart =
  extractScope.indexOf(
    "function parseAddressCandidate("
  );

if (parseCandidateStart < 0) {
  throw new Error(
    "Không tìm thấy parseAddressCandidate()."
  );
}

const locationAnchor =
  extractScope.indexOf(
    "const location =",
    parseCandidateStart
  );

if (locationAnchor < 0) {
  throw new Error(
    "Không tìm thấy const location trong parseAddressCandidate()."
  );
}

let parseCandidatePrefix =
  extractScope.slice(
    parseCandidateStart,
    locationAnchor
  );

const finalTrimIndex =
  parseCandidatePrefix.lastIndexOf(
    ".trim();"
  );

if (finalTrimIndex < 0) {
  throw new Error(
    "Không tìm thấy .trim(); của biến candidate."
  );
}

const additionalNormalization = `.replace(
          buildingAnnouncementPrefixPattern,
          ""
        )
        .replace(
          /^(?:địa\\s*chỉ(?:\\s*dự\\s*án)?|dia\\s*chi(?:\\s*du\\s*an)?|vị\\s*trí|vi\\s*tri|đc|dc)\\s*[:\\-]?\\s*/i,
          ""
        )
        `;

parseCandidatePrefix =
  parseCandidatePrefix.slice(
    0,
    finalTrimIndex
  ) +
  additionalNormalization +
  parseCandidatePrefix.slice(
    finalTrimIndex
  );

extractScope =
  extractScope.slice(
    0,
    parseCandidateStart
  ) +
  parseCandidatePrefix +
  extractScope.slice(
    locationAnchor
  );

/*
 * =========================================================
 * 3. CHO extractAddressParts() THỬ CÁC DÒNG TIÊU ĐỀ DỰ ÁN
 * =========================================================
 */
const fullAddressComment =
  /(\n\s*\/\*\s*\n\s*\*\s*2\.\s*Dòng đầy đủ bắt đầu bằng số nhà:)/;

const inlineParseLoop = `

  /*
   * ${PATCH_MARKER}
   *
   * Địa chỉ có thể nằm ngay sau tiêu đề dự án.
   * parseAddressCandidate() sẽ tự bỏ prefix trước khi bóc số nhà.
   */
  for (const line of lines) {
    if (
      buildingAnnouncementPrefixPattern.test(
        line
      ) &&
      parseAddressCandidate(
        line
      )
    ) {
      return result;
    }
  }
`;

extractScope =
  replaceExactlyOnce(
    extractScope,
    fullAddressComment,
    `${inlineParseLoop}$1`,
    "Không tìm thấy vị trí trước bước parse địa chỉ bắt đầu bằng số nhà."
  );

source =
  source.slice(
    0,
    extractStart
  ) +
  extractScope +
  source.slice(
    detectStart
  );

/*
 * =========================================================
 * 4. SỬA detectZaloBuildingCandidates()
 * =========================================================
 */
let detectScope =
  source.slice(
    source.indexOf(
      "export function detectZaloBuildingCandidates("
    )
  );

const houseNumberPatternAnchor =
  /(\n\s*const houseNumberAtStartPattern\s*=\s*\n?\s*\/[^;]+;)/;

const inlineCandidateRule = `

  /*
   * ${PATCH_MARKER}
   * Nhận địa chỉ đặt ngay sau tiêu đề dự án/tòa nhà.
   */
  const inlineProjectAddressPattern =
    /^(?:(?:hifriendz\\s*)?(?:(?:thông\\s*báo|thong\\s*bao|cập\\s*nhật|cap\\s*nhat|khai\\s*trương|khai\\s*truong|mở\\s*bán|mo\\s*ban)\\s+)?(?:dự\\s*án|du\\s*an|chdv|căn\\s*hộ\\s*dịch\\s*vụ|can\\s*ho\\s*dich\\s*vu|tòa\\s*nhà|toa\\s*nha)(?:\\s+(?:mới|moi|duy\\s*trì|duy\\s*tri|cao\\s*cấp|cao\\s*cap))*(?:\\s+(?:q(?:uận)?|quan)\\.?\\s*\\d{1,2})?\\s*[:\\-–—]\\s*(?:(?:địa\\s*chỉ(?:\\s*dự\\s*án)?|dia\\s*chi(?:\\s*du\\s*an)?)\\s*[:\\-]?\\s*)?\\d+[A-Za-z]{0,4}(?:(?:\\/|-)\\d+[A-Za-z]{0,4})*\\s+[A-Za-zÀ-ỹĐđ])/i;
`;

detectScope =
  replaceExactlyOnce(
    detectScope,
    houseNumberPatternAnchor,
    `$1${inlineCandidateRule}`,
    "Không tìm thấy houseNumberAtStartPattern trong detectZaloBuildingCandidates()."
  );

const candidateCondition =
  /addressLabelPattern\.test\(line\)\s*\|\|\s*houseNumberAtStartPattern\.test\(line\)/;

detectScope =
  replaceExactlyOnce(
    detectScope,
    candidateCondition,
    `addressLabelPattern.test(line) ||
      houseNumberAtStartPattern.test(line) ||
      inlineProjectAddressPattern.test(line)`,
    "Không tìm thấy điều kiện đưa dòng địa chỉ vào candidateTexts."
  );

const newDetectStart =
  source.indexOf(
    "export function detectZaloBuildingCandidates("
  );

source =
  source.slice(
    0,
    newDetectStart
  ) +
  detectScope;

fs.writeFileSync(
  TARGET,
  source,
  "utf8"
);

console.log(
  "Đã áp dụng Address Parser Fix V5.1."
);
console.log(
  "Đã hỗ trợ địa chỉ nằm sau tiêu đề DỰ ÁN/CHDV/TÒA NHÀ."
);
