import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const readerDir = path.dirname(fileURLToPath(import.meta.url));
const readerPath = path.join(readerDir, "zalo-reader.ts");
const backupPath = path.join(
  readerDir,
  "zalo-reader.before-semantic-parser.ts"
);

if (!fs.existsSync(backupPath)) {
  throw new Error(`Không tìm thấy backup: ${backupPath}`);
}

fs.copyFileSync(backupPath, readerPath);
console.log(`Đã khôi phục Reader từ: ${backupPath}`);
