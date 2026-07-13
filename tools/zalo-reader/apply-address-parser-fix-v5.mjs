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
  "ADDRESS_PARSER_V5_INLINE_BUILDING_HEADER";

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
    "Address Parser V5 đã được áp dụng trước đó."
  );
  process.exit(0);
}

if (!fs.existsSync(BACKUP)) {
  fs.copyFileSync(
    TARGET,
    BACKUP
  );

  console.log(
    `Đã sao lưu parser cũ: ${BACKUP}`
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

const parseCandidateStart =
  source.indexOf(
    "  function parseAddressCandidate(",
    extractStart
  );

if (parseCandidateStart < 0) {
  throw new Error(
    "Không tìm thấy parseAddressCandidate()."
  );
}

/*
 * Chèn rule nhận diện prefix của tin mở đầu dự án/tòa nhà.
 *
 * Hỗ trợ:
 * - DỰ ÁN DUY TRÌ: 517/18 Nguyễn Trãi...
 * - CẬP NHẬT DỰ ÁN DUY TRÌ: địa chỉ 1186 Võ Văn Kiệt...
 * - HIFRIENDZ THÔNG BÁO DỰ ÁN DUY TRÌ QUẬN 3: 413/8 Lê Văn Sỹ...
 * - KHAI TRƯƠNG CHDV CAO CẤP: 90/88F Nguyễn Đình Chiểu...
 */
const linesAnchor =
  source.indexOf(
    "\n  const lines =",
    extractStart
  );

if (
  linesAnchor < 0 ||
  linesAnchor > parseCandidateStart
) {
  throw new Error(
    "Không xác định được vị trí chèn buildingAnnouncementPrefixPattern."
  );
}

const prefixRule = `

  /*
   * ${PATCH_MARKER}
   *
   * Dòng thông tin tòa nhà có thể để địa chỉ ngay sau tiêu đề:
   *
   * DỰ ÁN DUY TRÌ: 517/18 Nguyễn Trãi, P An Đông Q5
   * HIFRIENDZ THÔNG BÁO DỰ ÁN DUY TRÌ QUẬN 3: 413/8 Lê Văn Sỹ
   *
   * Cần bỏ phần tiêu đề trước khi parse số nhà + tên đường.
   */
  const buildingAnnouncementPrefixPattern =
    /^(?:(?:hifriendz\\s*)?(?:(?:thông\\s*báo|thong\\s*bao|cập\\s*nhật|cap\\s*nhat|khai\\s*trương|khai\\s*truong|mở\\s*bán|mo\\s*ban)\\s+)?(?:dự\\s*án|du\\s*an|chdv|căn\\s*hộ\\s*dịch\\s*vụ|can\\s*ho\\s*dich\\s*vu|tòa\\s*nhà|toa\\s*nha)(?:\\s+(?:mới|moi|duy\\s*trì|duy\\s*tri|cao\\s*cấp|cao\\s*cap))*(?:\\s+(?:q(?:uận)?|quan)\\.?\\s*\\d{1,2})?\\s*[:\\-–—]\\s*)/i;
`;

source =
  source.slice(0, linesAnchor) +
  prefixRule +
  source.slice(linesAnchor);

/*
 * Sau khi bỏ prefix DỰ ÁN/CHDV, chạy lại bước bỏ nhãn "Địa chỉ".
 *
 * Ví dụ:
 * CẬP NHẬT DỰ ÁN DUY TRÌ: địa chỉ 1186 Võ Văn Kiệt
 * -> địa chỉ 1186 Võ Văn Kiệt
 * -> 1186 Võ Văn Kiệt
 */
const updatedParseCandidateStart =
  source.indexOf(
    "  function parseAddressCandidate(",
    extractStart
  );

const parseCandidateEnd =
  source.indexOf(
    "\n\n    const location =",
    updatedParseCandidateStart
  );

if (parseCandidateEnd < 0) {
  throw new Error(
    "Không tìm thấy điểm kết thúc phần chuẩn hóa parseAddressCandidate()."
  );
}

let candidateBlock =
  source.slice(
    updatedParseCandidateStart,
    parseCandidateEnd
  );

const candidateTrimNeedle =
  `        )
        .trim();`;

if (
  !candidateBlock.includes(
    candidateTrimNeedle
  )
) {
  throw new Error(
    "Cấu trúc parseAddressCandidate() đã thay đổi; không thể chèn V5 an toàn."
  );
}

candidateBlock =
  candidateBlock.replace(
    candidateTrimNeedle,
    `        )
        .replace(
          buildingAnnouncementPrefixPattern,
          ""
        )
        .replace(
          /^(?:địa\\s*chỉ(?:\\s*dự\\s*án)?|dia\\s*chi(?:\\s*du\\s*an)?|vị\\s*trí|vi\\s*tri|đc|dc)\\s*[:\\-]?\\s*/i,
          ""
        )
        .trim();`
  );

source =
  source.slice(
    0,
    updatedParseCandidateStart
  ) +
  candidateBlock +
  source.slice(parseCandidateEnd);

/*
 * Bổ sung cùng rule vào detectZaloBuildingCandidates().
 * Việc này giúp nút "Phân tích lại dữ liệu" và kiểm tra nhiều tòa nhà
 * cũng nhận được địa chỉ nằm sau tiêu đề dự án.
 */
const detectStart =
  source.indexOf(
    "export function detectZaloBuildingCandidates("
  );

if (detectStart < 0) {
  throw new Error(
    "Không tìm thấy detectZaloBuildingCandidates()."
  );
}

const detectLoopStart =
  source.indexOf(
    "\n\n  for (",
    detectStart
  );

if (detectLoopStart < 0) {
  throw new Error(
    "Không tìm thấy vòng lặp candidate của detectZaloBuildingCandidates()."
  );
}

const detectRule = `

  /*
   * ${PATCH_MARKER}
   * Nhận địa chỉ nằm ngay sau tiêu đề dự án/tòa nhà.
   */
  const inlineProjectAddressPattern =
    /^(?:(?:hifriendz\\s*)?(?:(?:thông\\s*báo|thong\\s*bao|cập\\s*nhật|cap\\s*nhat|khai\\s*trương|khai\\s*truong|mở\\s*bán|mo\\s*ban)\\s+)?(?:dự\\s*án|du\\s*an|chdv|căn\\s*hộ\\s*dịch\\s*vụ|can\\s*ho\\s*dich\\s*vu|tòa\\s*nhà|toa\\s*nha)(?:\\s+(?:mới|moi|duy\\s*trì|duy\\s*tri|cao\\s*cấp|cao\\s*cap))*(?:\\s+(?:q(?:uận)?|quan)\\.?\\s*\\d{1,2})?\\s*[:\\-–—]\\s*(?:(?:địa\\s*chỉ(?:\\s*dự\\s*án)?|dia\\s*chi(?:\\s*du\\s*an)?)\\s*[:\\-]?\\s*)?\\d+[A-Za-z]{0,4}(?:(?:\\/|-)\\d+[A-Za-z]{0,4})*\\s+[A-Za-zÀ-ỹĐđ])/i;
`;

source =
  source.slice(0, detectLoopStart) +
  detectRule +
  source.slice(detectLoopStart);

const updatedDetectStart =
  source.indexOf(
    "export function detectZaloBuildingCandidates("
  );

const updatedDetectEnd =
  source.indexOf(
    "\n\n  /*",
    source.indexOf(
      "candidateTexts.push(line);",
      updatedDetectStart
    )
  );

const detectConditionNeedle =
  `      addressLabelPattern.test(line) ||
      houseNumberAtStartPattern.test(line)`;

const detectConditionReplacement =
  `      addressLabelPattern.test(line) ||
      houseNumberAtStartPattern.test(line) ||
      inlineProjectAddressPattern.test(line)`;

const detectScopeEnd =
  updatedDetectEnd > updatedDetectStart
    ? updatedDetectEnd
    : source.length;

const detectScope =
  source.slice(
    updatedDetectStart,
    detectScopeEnd
  );

if (
  !detectScope.includes(
    detectConditionNeedle
  )
) {
  throw new Error(
    "Không tìm thấy điều kiện candidate để thêm inlineProjectAddressPattern."
  );
}

const updatedDetectScope =
  detectScope.replace(
    detectConditionNeedle,
    detectConditionReplacement
  );

source =
  source.slice(
    0,
    updatedDetectStart
  ) +
  updatedDetectScope +
  source.slice(detectScopeEnd);

fs.writeFileSync(
  TARGET,
  source,
  "utf8"
);

console.log(
  "Đã áp dụng Address Parser Fix V5."
);
console.log(
  "Đã hỗ trợ địa chỉ nằm sau tiêu đề DỰ ÁN/CHDV/TÒA NHÀ."
);
