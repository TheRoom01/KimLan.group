import fs from "fs";
import path from "path";

const ROOT = process.cwd();

const TARGET = path.join(
  ROOT,
  "lib/zalo-import/parser.ts"
);

const BACKUP = path.join(
  ROOT,
  "lib/zalo-import/parser.before-house-v7.ts"
);

const PATCH_MARKER =
  "ADDRESS_PARSER_V7_ALPHANUMERIC_HOUSE_NUMBER";

if (!fs.existsSync(TARGET)) {
  throw new Error(
    `Không tìm thấy file: ${TARGET}`
  );
}

let source = fs
  .readFileSync(
    TARGET,
    "utf8"
  )
  .replace(/\r\n?/g, "\n");

if (source.includes(PATCH_MARKER)) {
  console.log(
    "Address Parser V7 đã được áp dụng trước đó."
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

function updateConstBlock(
  input,
  constName,
  updater
) {
  const startNeedle =
    `const ${constName}`;

  const start =
    input.indexOf(
      startNeedle
    );

  if (start < 0) {
    throw new Error(
      `Không tìm thấy ${startNeedle}`
    );
  }

  const second =
    input.indexOf(
      startNeedle,
      start + startNeedle.length
    );

  if (second >= 0) {
    throw new Error(
      `Tìm thấy nhiều hơn một ${startNeedle}`
    );
  }

  const end =
    input.indexOf(
      ";",
      start
    );

  if (end < 0) {
    throw new Error(
      `Không tìm thấy dấu ; kết thúc ${constName}`
    );
  }

  const block =
    input.slice(
      start,
      end + 1
    );

  const updated =
    updater(block);

  if (
    !updated ||
    updated === block
  ) {
    throw new Error(
      `Không sửa được block ${constName}`
    );
  }

  return (
    input.slice(0, start) +
    updated +
    input.slice(end + 1)
  );
}

/*
 * =========================================================
 * 1. Parser địa chỉ chính
 * =========================================================
 *
 * Cũ:
 *   517/18
 *   90/88F
 *
 * Mới hỗ trợ thêm:
 *   B19/6
 *   A12/3
 *   C5
 */
source =
  updateConstBlock(
    source,
    "houseNumberSource",
    (block) => {
      const oldToken =
        `"\\\\d+[A-Za-z]{0,4}"`;

      const newToken =
        `"(?:[A-Za-z]{1,4})?\\\\d+[A-Za-z]{0,4}"`;

      if (
        !block.includes(
          oldToken
        )
      ) {
        throw new Error(
          "houseNumberSource không còn đúng cấu trúc dự kiến."
        );
      }

      return (
        `/* ${PATCH_MARKER} */\n  ` +
        block.replace(
          oldToken,
          newToken
        )
      );
    }
  );

/*
 * =========================================================
 * 2. Nhận diện dòng bắt đầu bằng số nhà
 * =========================================================
 */
source =
  updateConstBlock(
    source,
    "houseNumberAtStartPattern",
    (block) => {
      const oldToken =
        `/^\\d+[A-Za-z]{0,4}`;

      const newToken =
        `/^(?:[A-Za-z]{1,4})?\\d+[A-Za-z]{0,4}`;

      if (
        !block.includes(
          oldToken
        )
      ) {
        throw new Error(
          "houseNumberAtStartPattern không còn đúng cấu trúc dự kiến."
        );
      }

      return block.replace(
        oldToken,
        newToken
      );
    }
  );

/*
 * =========================================================
 * 3. Địa chỉ nằm sau tiêu đề dự án
 * =========================================================
 *
 * Ví dụ:
 * HIFRIENDZ ...: B19/6 Cư Xá Phú Lâm B. Q6
 */
source =
  updateConstBlock(
    source,
    "inlineProjectAddressPattern",
    (block) => {
      const oldToken =
        `\\d+[A-Za-z]{0,4}(?:(?:\\/|-)\\d+[A-Za-z]{0,4})*`;

      const newToken =
        `(?:[A-Za-z]{1,4})?\\d+[A-Za-z]{0,4}(?:(?:\\/|-)\\d+[A-Za-z]{0,4})*`;

      if (
        !block.includes(
          oldToken
        )
      ) {
        throw new Error(
          "inlineProjectAddressPattern không còn đúng cấu trúc dự kiến."
        );
      }

      return block.replace(
        oldToken,
        newToken
      );
    }
  );

fs.writeFileSync(
  TARGET,
  source,
  "utf8"
);

console.log(
  "Đã áp dụng Address Parser Fix V7."
);
console.log(
  "Đã hỗ trợ số nhà bắt đầu bằng chữ như B19/6."
);
