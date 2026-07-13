import fs from "fs";
import path from "path";

const ROOT = process.cwd();

const TARGET = path.join(
  ROOT,
  "lib/zalo-import/parser.ts"
);

const BACKUP = path.join(
  ROOT,
  "lib/zalo-import/parser.before-money-v6.ts"
);

const PATCH_MARKER =
  "MONEY_PARSER_V6_1_COMPACT_THOUSAND";

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
    "Money Parser V6.1 đã được áp dụng trước đó."
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
} else {
  console.log(
    `Đã có backup: ${BACKUP}`
  );
}

function replaceOnceRegex(
  input,
  pattern,
  replacement,
  label
) {
  const flags =
    pattern.flags.includes("g")
      ? pattern.flags
      : pattern.flags + "g";

  const matcher =
    new RegExp(
      pattern.source,
      flags
    );

  const matches =
    Array.from(
      input.matchAll(matcher)
    );

  if (matches.length !== 1) {
    throw new Error(
      `${label}: cần đúng 1 vị trí, hiện tìm thấy ${matches.length}.`
    );
  }

  return input.replace(
    pattern,
    replacement
  );
}

/*
 * =========================================================
 * 1. normalizeMoneyToVnd(): 3k8 -> 3.800
 * =========================================================
 *
 * Chèn ngay trước const compactMillion.
 */
const compactMillionPattern =
  /(\r?\n\s*const\s+compactMillion\s*=\s*\r?\n?\s*parseCompactMillionToVnd\s*\()/;

const compactThousandBlock = `

  /*
   * ${PATCH_MARKER}
   *
   * Dạng nghìn viết liền:
   *
   * 3k8   -> 3.800
   * 3k80  -> 3.800
   * 3k800 -> 3.800
   * 3k05  -> 3.050
   *
   * Chỉ nhận phần sau chữ k khi viết liền.
   */
  const compactThousandMatch =
    normalized.match(
      /\\b(\\d+)\\s*k(\\d{1,3})\\b/i
    );

  if (
    compactThousandMatch?.[1] &&
    compactThousandMatch?.[2]
  ) {
    const wholeThousands =
      Number(
        compactThousandMatch[1]
      );

    const fractionThousands =
      Number(
        \`0.\${compactThousandMatch[2]}\`
      );

    if (
      Number.isFinite(
        wholeThousands
      ) &&
      Number.isFinite(
        fractionThousands
      )
    ) {
      return Math.round(
        (
          wholeThousands +
          fractionThousands
        ) *
          1_000
      );
    }
  }
$1`;

source =
  replaceOnceRegex(
    source,
    compactMillionPattern,
    compactThousandBlock,
    "Không thể chèn compact thousand trước compactMillion"
  );

/*
 * =========================================================
 * 2. extractFeeAmounts(): nhận token 3k8
 * =========================================================
 */
const feeRegexPattern =
  /\/\(\?:\\d\+\\s\*\(\?:tr\|trieu\)\\d\{1,3\}\(\?:k\)\?\\b\)\|\(\?:\\d\+\(\?:\[\.,\]\\d\+\)\?\\s\*\(\?:tr\|trieu\)\\b\)\|\(\?:\\d\+\(\?:\[\.,\]\\d\+\)\?\\s\*\(\?:k\|nghin\|ngan\)\\b\)\|\(\?:\\d\{1,3\}\(\?:\[\.,\]\\d\{3\}\)\+\\s\*\(\?:d\|dong\)\?\\b\)\/gi/;

const newFeeRegex =
  `/(?:\\d+\\s*(?:tr|trieu)\\d{1,3}(?:k)?\\b)|(?:\\d+\\s*k\\d{1,3}\\b)|(?:\\d+(?:[.,]\\d+)?\\s*(?:tr|trieu)\\b)|(?:\\d+(?:[.,]\\d+)?\\s*(?:k|nghin|ngan)\\b)|(?:\\d{1,3}(?:[.,]\\d{3})+\\s*(?:d|dong)?\\b)/gi`;

source =
  replaceOnceRegex(
    source,
    feeRegexPattern,
    newFeeRegex,
    "Không thể cập nhật regex extractFeeAmounts"
  );

/*
 * =========================================================
 * 3. moneyToken của phí dịch vụ: nhận 3k8
 * =========================================================
 */
const serviceMoneyTokenPattern =
  /("\\\\d\+\\\\s\*\(\?:tr\|trieu\)\\\\d\{1,3\}\(\?:k\)\?\\\\b\|"\s*\+\s*\r?\n)(\s*"\\\\d\+\(\?:\[\.,\]\\\\d\+\)\?\\\\s\*\(\?:tr\|trieu\|k\|nghin\|ngan\)\\\\b\|")/;

source =
  replaceOnceRegex(
    source,
    serviceMoneyTokenPattern,
    `$1    "\\\\d+\\\\s*k\\\\d{1,3}\\\\b|" +\n$2`,
    "Không thể thêm compact k vào moneyToken phí dịch vụ"
  );

/*
 * =========================================================
 * 4. Helper đọc phí tiện ích
 * =========================================================
 *
 * Chèn trước parseZaloRoomText để điện/nước/xe dùng chung.
 */
const parseFunctionPattern =
  /(\r?\nexport function parseZaloRoomText\s*\()/;

const helperBlock = `

/*
 * ${PATCH_MARKER}
 *
 * Đọc số tiền tiện ích, ưu tiên dạng compact nghìn:
 * 3k8, 3k80, 3k800.
 */
function extractUtilityFeeValue(
  text: string,
  labelPattern: string
): number | null {
  const pattern =
    new RegExp(
      \`(?:\${labelPattern})\\\\s*[:\\\\-]?\\\\s*((?:\\\\d+\\\\s*k\\\\d{1,3}\\\\b)|(?:\\\\d+(?:[.,]\\\\d+)?\\\\s*(?:k|nghìn|ngan|ngàn)?\\\\b))\`,
      "i"
    );

  const match =
    String(text || "").match(
      pattern
    );

  if (!match?.[1]) {
    return null;
  }

  return normalizeMoneyToVnd(
    match[1]
  );
}
$1`;

source =
  replaceOnceRegex(
    source,
    parseFunctionPattern,
    helperBlock,
    "Không thể chèn extractUtilityFeeValue trước parseZaloRoomText"
  );

/*
 * =========================================================
 * 5. Thay ba block điện / nước / giữ xe
 * =========================================================
 */
const electricBlockPattern =
  /\s*const\s+electricMatch\s*=\s*text\.match\([\s\S]*?\);\s*if\s*\(\s*electricMatch\?\.\[0\]\s*\)\s*\{[\s\S]*?sourceFieldMap\.electric_fee_value\s*=\s*"Tin Zalo";\s*\}/;

const electricReplacement = `

  const electricFeeValue =
    extractUtilityFeeValue(
      text,
      "điện|dien"
    );

  if (electricFeeValue != null) {
    detailPayload.electric_fee_value =
      electricFeeValue;

    sourceFieldMap.electric_fee_value =
      "Tin Zalo";
  }`;

source =
  replaceOnceRegex(
    source,
    electricBlockPattern,
    electricReplacement,
    "Không thể thay khối electricMatch"
  );

const waterBlockPattern =
  /\s*const\s+waterMatch\s*=\s*text\.match\([\s\S]*?\);\s*if\s*\(\s*waterMatch\?\.\[0\]\s*\)\s*\{[\s\S]*?sourceFieldMap\.water_fee_value\s*=\s*"Tin Zalo";\s*\}/;

const waterReplacement = `

  const waterFeeValue =
    extractUtilityFeeValue(
      text,
      "nước|nuoc"
    );

  if (waterFeeValue != null) {
    detailPayload.water_fee_value =
      waterFeeValue;

    sourceFieldMap.water_fee_value =
      "Tin Zalo";
  }`;

source =
  replaceOnceRegex(
    source,
    waterBlockPattern,
    waterReplacement,
    "Không thể thay khối waterMatch"
  );

const parkingBlockPattern =
  /\s*const\s+parkingMatch\s*=\s*text\.match\([\s\S]*?\);\s*if\s*\(\s*parkingMatch\?\.\[0\]\s*\)\s*\{[\s\S]*?sourceFieldMap\.parking_fee_value\s*=\s*"Tin Zalo";\s*\}/;

const parkingReplacement = `

  const parkingFeeValue =
    extractUtilityFeeValue(
      text,
      "xe|giữ xe|giu xe|parking"
    );

  if (parkingFeeValue != null) {
    detailPayload.parking_fee_value =
      parkingFeeValue;

    sourceFieldMap.parking_fee_value =
      "Tin Zalo";
  }`;

source =
  replaceOnceRegex(
    source,
    parkingBlockPattern,
    parkingReplacement,
    "Không thể thay khối parkingMatch"
  );

fs.writeFileSync(
  TARGET,
  source,
  "utf8"
);

console.log(
  "Đã áp dụng Money Parser Fix V6.1."
);
console.log(
  "Điện 3k8 sẽ được hiểu là 3.800đ."
);
