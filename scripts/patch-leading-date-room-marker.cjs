const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(process.cwd(), "tools/zalo-reader/parsers/utils.ts");
let source = fs.readFileSync(filePath, "utf8");

const before = `export function extractRoomCode(input: unknown) {
  const normalized = stripLeadingDecorations(input);
  if (!normalized || !hasRoomPrice(normalized)) return "";

  if (/^\\d+[a-z]?(?:\\/\\d+[a-z]?)+\\b/.test(normalized)) {
    return "";
  }
`;

const after = `export function extractRoomCode(input: unknown) {
  const normalized = stripLeadingDecorations(input);
  if (!normalized || !hasRoomPrice(normalized)) return "";

  /*
   * Một số nhóm đặt ngày đăng ở đầu marker phòng:
   *   1/9 Trống mã lầu 4 giảm còn 5tr5
   *   14/07/2026 Còn trống P302 giá 6tr
   *
   * Chỉ bỏ phần ngày khi ngay sau đó có tín hiệu phòng mạnh. Nhờ vậy
   * địa chỉ dạng 8/911B Tạ Quang Bửu vẫn tiếp tục bị chặn như trước.
   */
  const withoutLeadingDate = normalized.replace(
    /^\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?\\s+(?=(?:trong|trong san|phong trong|con trong|dang trong|available|phong|ma phong|ma)\\b)/,
    ""
  );

  if (/^\\d+[a-z]?(?:\\/\\d+[a-z]?)+\\b/.test(withoutLeadingDate)) {
    return "";
  }
`;

if (!source.includes(before)) {
  throw new Error("Không tìm thấy đoạn extractRoomCode cần patch");
}

source = source.replace(before, after);
source = source.replace(
  "  const withoutVacancyPrefix = normalized\n",
  "  const withoutVacancyPrefix = withoutLeadingDate\n"
);

fs.writeFileSync(filePath, source, "utf8");
