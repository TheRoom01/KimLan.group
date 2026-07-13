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
  "MONEY_PARSER_V6_COMPACT_THOUSAND";

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
    "Money Parser V6 đã được áp dụng trước đó."
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

function replaceExactlyOnce(
  input,
  searchValue,
  replacement,
  label
) {
  const first =
    input.indexOf(searchValue);

  if (first < 0) {
    throw new Error(
      `Không tìm thấy đoạn cần sửa: ${label}`
    );
  }

  const second =
    input.indexOf(
      searchValue,
      first + searchValue.length
    );

  if (second >= 0) {
    throw new Error(
      `Tìm thấy nhiều hơn một đoạn: ${label}`
    );
  }

  return (
    input.slice(0, first) +
    replacement +
    input.slice(
      first + searchValue.length
    )
  );
}

/*
 * =========================================================
 * 1. NORMALIZE MONEY: 3k8 -> 3.800
 * =========================================================
 */
const compactMillionAnchor = `  /*
   * ============================
   * 1. DẠNG 3tr5 / 3tr500
   * ============================
   *
   * Phải kiểm tra trước các dạng khác.
   */`;

const compactThousandBlock = `  /*
   * ${PATCH_MARKER}
   * ============================
   * DẠNG 3k8 / 3k80 / 3k800
   * ============================
   *
   * Quy ước dữ liệu Zalo:
   *
   * 3k8   → 3.800
   * 3k80  → 3.800
   * 3k800 → 3.800
   * 3k05  → 3.050
   *
   * Chỉ nhận phần sau chữ k khi viết liền,
   * tránh ghép nhầm số ở đơn vị hoặc nội dung kế tiếp.
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

${compactMillionAnchor}`;

source =
  replaceExactlyOnce(
    source,
    compactMillionAnchor,
    compactThousandBlock,
    "thêm compact thousand vào normalizeMoneyToVnd"
  );

/*
 * =========================================================
 * 2. EXTRACT FEE AMOUNTS
 * =========================================================
 */
const oldFeeAmountRegex =
  `/(?:\\d+\\s*(?:tr|trieu)\\d{1,3}(?:k)?\\b)|(?:\\d+(?:[.,]\\d+)?\\s*(?:tr|trieu)\\b)|(?:\\d+(?:[.,]\\d+)?\\s*(?:k|nghin|ngan)\\b)|(?:\\d{1,3}(?:[.,]\\d{3})+\\s*(?:d|dong)?\\b)/gi`;

const newFeeAmountRegex =
  `/(?:\\d+\\s*(?:tr|trieu)\\d{1,3}(?:k)?\\b)|(?:\\d+\\s*k\\d{1,3}\\b)|(?:\\d+(?:[.,]\\d+)?\\s*(?:tr|trieu)\\b)|(?:\\d+(?:[.,]\\d+)?\\s*(?:k|nghin|ngan)\\b)|(?:\\d{1,3}(?:[.,]\\d{3})+\\s*(?:d|dong)?\\b)/gi`;

source =
  replaceExactlyOnce(
    source,
    oldFeeAmountRegex,
    newFeeAmountRegex,
    "regex extractFeeAmounts"
  );

/*
 * =========================================================
 * 3. SERVICE FEE MONEY TOKEN
 * =========================================================
 */
const oldServiceMoneyToken = `    "\\\\d+\\\\s*(?:tr|trieu)\\\\d{1,3}(?:k)?\\\\b|" +
    "\\\\d+(?:[.,]\\\\d+)?\\\\s*(?:tr|trieu|k|nghin|ngan)\\\\b|" +`;

const newServiceMoneyToken = `    "\\\\d+\\\\s*(?:tr|trieu)\\\\d{1,3}(?:k)?\\\\b|" +
    "\\\\d+\\\\s*k\\\\d{1,3}\\\\b|" +
    "\\\\d+(?:[.,]\\\\d+)?\\\\s*(?:tr|trieu|k|nghin|ngan)\\\\b|" +`;

source =
  replaceExactlyOnce(
    source,
    oldServiceMoneyToken,
    newServiceMoneyToken,
    "moneyToken của phí dịch vụ"
  );

/*
 * =========================================================
 * 4. ĐIỆN / NƯỚC / GIỮ XE
 * =========================================================
 *
 * Regex cũ match "Điện 3k" trong chuỗi "Điện 3k8",
 * làm mất số 8. Regex mới ưu tiên compact k trước.
 */
const oldElectricBlock = `  const electricMatch = text.match(/(?:điện|dien)\\s*[:\\-]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(k|nghìn|ngan|ngàn)?/i);
  if (electricMatch?.[0]) {
    detailPayload.electric_fee_value = normalizeMoneyToVnd(electricMatch[0]);
    sourceFieldMap.electric_fee_value = "Tin Zalo";
  }`;

const newElectricBlock = `  const electricMatch =
    text.match(
      /(?:điện|dien)\\s*[:\\-]?\\s*((?:\\d+\\s*k\\d{1,3}\\b)|(?:\\d+(?:[.,]\\d+)?\\s*(?:k|nghìn|ngan|ngàn)?\\b))/i
    );

  if (electricMatch?.[1]) {
    detailPayload.electric_fee_value =
      normalizeMoneyToVnd(
        electricMatch[1]
      );

    sourceFieldMap.electric_fee_value =
      "Tin Zalo";
  }`;

source =
  replaceExactlyOnce(
    source,
    oldElectricBlock,
    newElectricBlock,
    "khối electricMatch"
  );

const oldWaterBlock = `  const waterMatch = text.match(/(?:nước|nuoc)\\s*[:\\-]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(k|nghìn|ngan|ngàn)?/i);
  if (waterMatch?.[0]) {
    detailPayload.water_fee_value = normalizeMoneyToVnd(waterMatch[0]);
    sourceFieldMap.water_fee_value = "Tin Zalo";
  }`;

const newWaterBlock = `  const waterMatch =
    text.match(
      /(?:nước|nuoc)\\s*[:\\-]?\\s*((?:\\d+\\s*k\\d{1,3}\\b)|(?:\\d+(?:[.,]\\d+)?\\s*(?:k|nghìn|ngan|ngàn)?\\b))/i
    );

  if (waterMatch?.[1]) {
    detailPayload.water_fee_value =
      normalizeMoneyToVnd(
        waterMatch[1]
      );

    sourceFieldMap.water_fee_value =
      "Tin Zalo";
  }`;

source =
  replaceExactlyOnce(
    source,
    oldWaterBlock,
    newWaterBlock,
    "khối waterMatch"
  );

const oldParkingBlock = `  const parkingMatch = text.match(/(?:xe|giữ xe|giu xe|parking)\\s*[:\\-]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(k|nghìn|ngan|ngàn)?/i);
  if (parkingMatch?.[0]) {
    detailPayload.parking_fee_value = normalizeMoneyToVnd(parkingMatch[0]);
    sourceFieldMap.parking_fee_value = "Tin Zalo";
  }`;

const newParkingBlock = `  const parkingMatch =
    text.match(
      /(?:xe|giữ xe|giu xe|parking)\\s*[:\\-]?\\s*((?:\\d+\\s*k\\d{1,3}\\b)|(?:\\d+(?:[.,]\\d+)?\\s*(?:k|nghìn|ngan|ngàn)?\\b))/i
    );

  if (parkingMatch?.[1]) {
    detailPayload.parking_fee_value =
      normalizeMoneyToVnd(
        parkingMatch[1]
      );

    sourceFieldMap.parking_fee_value =
      "Tin Zalo";
  }`;

source =
  replaceExactlyOnce(
    source,
    oldParkingBlock,
    newParkingBlock,
    "khối parkingMatch"
  );

fs.writeFileSync(
  TARGET,
  source,
  "utf8"
);

console.log(
  "Đã áp dụng Money Parser Fix V6."
);
console.log(
  "3k8 sẽ được hiểu là 3.800đ."
);
