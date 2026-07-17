// @ts-ignore Node built-in type is available in the project runtime.
import crypto from "crypto";

import type {
  SemanticAlbumPreview,
  SemanticIndexedDbMessage,
  SemanticVideoPayload,
} from "./types";

export function stableText(input: unknown) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Bỏ emoji, bullet và ký hiệu trang trí ở đầu dòng trước khi
 * nhận diện nhãn/địa chỉ. Ví dụ:
 * 📌Địa chỉ: 90/88F Nguyễn Đình Chiểu
 * + Điện: 4k/kwh
 * -> P102 - 13tr5
 */
export function stripLeadingDecorations(input: unknown) {
  return stableText(input)
    .replace(/^[^a-z0-9]+/g, "")
    .trim();
}

export function cleanText(input: unknown) {
  return String(input || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function uniqueTexts(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    const text = cleanText(raw);
    const key = stableText(text)
      .replace(/[.,:;|()[\]{}+\-–—]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(text);
  }

  return result;
}

export function messageTimestamp(
  message: SemanticIndexedDbMessage
) {
  const candidates = [
    Number(message.sendDttm || 0),
    Number(message.serverTime || 0),
    Number(message.cliMsgId || 0),
    Number(message.domHydration?.approxTimestamp || 0),
  ];

  return (
    candidates.find(
      (value) => Number.isFinite(value) && value > 0
    ) || 0
  );
}

export function sortMessages(
  messages: SemanticIndexedDbMessage[]
) {
  return [...messages].sort((a, b) => {
    const timeDiff = messageTimestamp(a) - messageTimestamp(b);
    if (timeDiff !== 0) return timeDiff;

    const orderDiff =
      Number(a.domHydration?.order ?? Number.MAX_SAFE_INTEGER) -
      Number(b.domHydration?.order ?? Number.MAX_SAFE_INTEGER);

    if (orderDiff !== 0) return orderDiff;

    return String(a.msgId || "").localeCompare(
      String(b.msgId || "")
    );
  });
}

export function isSeparatorText(input: unknown) {
  const compact = String(input || "")
    .replace(/\s+/g, "")
    .trim();

  if (!compact) return false;

  return (
    compact.includes("###") ||
    compact.includes("///") ||
    /^[-_➖—–=]{5,}$/.test(compact) ||
    /^[-_➖—–=]{4,}#{1,}[-_➖—–=]{4,}$/.test(compact)
  );
}

export function isProjectHeaderText(input: unknown) {
  const normalized = stripLeadingDecorations(input);

  return (
    /^(?:hifriendz\b[\s:._\-–—]*)?(?:thong bao\s+)?(?:cap nhat\s+)?du an(?:\s+moi|\s+duy tri)?\b/.test(
      normalized
    ) ||
    /^(?:khai truong|mo ban|cap nhat|thong bao)\s+(?:chdv|can ho dich vu|toa nha|du an)\b/.test(
      normalized
    )
  );
}

function normalizeAddressStreet(input: string) {
  return stableText(input)
    .replace(
      /\b(?:phuong|p\.?|quan|q\.?|tp\.?|tphcm|thanh pho|hotline|lh|lien he)\b.*$/,
      ""
    )
    .replace(/[,:;|()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* FINAL_BLOCK_ROOM_DATE_GUARD */
function isDatedRoomMarkerText(input: unknown) {
  const text = cleanText(input);
  if (!text || !hasRoomPrice(text)) return false;

  return text
    .split("\n")
    .map((line) => stripLeadingDecorations(line))
    .some((line) =>
      /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s+(?=(?:trong|trong san|con trong|phong trong|dang trong|available|phong|ma phong|ma)\b)/i.test(
        line
      )
    );
}
export function extractAddressKey(input: unknown) {
  const text = cleanText(input);
  if (!text) return "";

  /* Ngày đăng + trạng thái phòng + giá không phải địa chỉ. */
  if (isDatedRoomMarkerText(text)) return "";

  /*
   * Phải xét từng dòng riêng. stableText() sẽ gom newline thành
   * khoảng trắng, vì vậy dùng nó cho toàn message sẽ bỏ lỡ địa chỉ
   * nằm ở dòng 2 sau tiêu đề "Khai Trương CHDV...".
   */
  const candidates = text
    .split("\n")
    .map((rawLine) =>
      stripLeadingDecorations(rawLine)
        /*
         * Dữ liệu Zalo hay dùng dấu gạch dưới để ngăn địa chỉ,
         * phường và quận:
         *   413/8 Lê Văn Sỹ_F12_ Quận 3
         * Coi underscore như khoảng trắng để không làm hỏng street match.
         */
        .replace(/_+/g, " ")
        .replace(
          /^(?:cap nhat\s+)?du an(?:\s+moi|\s+duy tri)?\s*[:\-]?\s*/,
          ""
        )
        .replace(
          /^(?:dia chi(?:\s+du an)?|dc)\s*[:\-]?\s*/,
          ""
        )
        .trim()
    )
    .filter(Boolean);

  for (const line of candidates) {
    const match = line.match(
      /^(\d+[a-z]*(?:(?:\/|-)\d+[a-z]*)*)\s+([a-z][a-z0-9.'\s-]{2,100}?)(?=\s*(?:,|\(|-|\||$|\b(?:p\.?|f\d{1,2}|phuong|q\.?|quan|tp|tphcm|hotline)\b))/i
    );

    if (!match?.[1] || !match?.[2]) {
      continue;
    }

    const street = normalizeAddressStreet(match[2]);
    if (!street || street.length < 2) {
      continue;
    }

    /*
     * Chặn các dòng trạng thái phòng bị nhận nhầm thành địa chỉ:
     *   1/8 trống
     *   2/10 còn trống
     *
     * Địa chỉ trần không có nhãn vẫn phải có ít nhất hai từ tên đường,
     * trừ khi dòng đã có tín hiệu địa lý rõ như Quận/Phường/F12/TPHCM.
     */
    const hasLocationCue =
      /\b(?:p\.?\s*[a-z0-9]+|f\d{1,2}|phuong|q\.?\s*\d{1,2}|quan|tp\.?|tphcm|thanh pho)\b/i.test(
        line
      );

    const streetTokens = street
      .split(/\s+/)
      .filter(Boolean);

    const blockedStreet =
      /^(?:trong|con trong|phong trong|available|giu cho|da thue)$/i.test(
        street
      );

    if (
      blockedStreet ||
      (!hasLocationCue && streetTokens.length < 2)
    ) {
      continue;
    }

    const districtMatch = line.match(
      /\b(?:q\.?|quan)\s*[:.]?\s*(\d{1,2}|binh thanh|go vap|phu nhuan|tan binh|tan phu|thu duc|binh tan)\b/i
    );

    return [
      match[1].replace(/\s+/g, ""),
      street,
      districtMatch?.[1] || "",
    ].join("|");
  }

  return "";
}

export function looksLikeBuildingStart(input: unknown) {
  const text = cleanText(input);
  const normalized = stableText(text);

  if (!normalized) return false;
  if (isProjectHeaderText(text)) return true;
  if (extractAddressKey(text)) return true;

  const signals = [
    "dia chi",
    "quy mo",
    "toa nha",
    "thang may",
    "thang bo",
    "tong so phong",
    "phi dich vu",
    "dien",
    "nuoc",
    "giu xe",
    "gui xe",
    "hoa hong",
    "thu cung",
    "khach nuoc ngoai",
    "coc toi thieu",
    "huy coc",
  ];

  const count = signals.filter((signal) =>
    normalized.includes(signal)
  ).length;

  return count >= 3;
}

export function looksLikeBuildingLine(input: unknown) {
  const normalized = stripLeadingDecorations(input);
  if (!normalized) return false;

  if (isProjectHeaderText(normalized)) return true;
  if (extractAddressKey(input)) return true;

  return /^(?:dia chi(?:\s+du an)?|quy mo|toa nha|tong so phong|dien|nuoc|xe|giu xe|gui xe|phi dich vu|dich vu|giat|may giat|coc|coc toi thieu|hop dong|hd|hoa hong|hh|huy coc|so luong nguoi|toi da|thu cung|pet|khach nuoc ngoai|noi that|dan khach|lien he|hotline|chinh sach|chuyen khoan)\b/.test(
    normalized
  );
}

export function isNoiseText(input: unknown) {
  const text = cleanText(input);
  if (!text) return true;

  const compact = text.replace(/[^\p{L}\p{N}]/gu, "");
  if (compact.length < 2) return true;

  return /^(?:\/-[a-z0-9_-]+|:\>|:o|:-\(\(|:-h)$/i.test(
    text
  );
}

export function hasRoomPrice(input: unknown) {
  const normalized = stableText(input);

  return (
    /\b\d+\s*(?:tr|trieu)\d{0,3}\b/.test(normalized) ||
    /\b\d+(?:[.,]\d+)?\s*(?:tr|trieu)\b/.test(
      normalized
    ) ||
    /\b\d{1,3}(?:[.,]\d{3}){1,2}\s*(?:d|dong)?\b/.test(
      normalized
    )
  );
}

export function extractRoomCode(input: unknown) {
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
    /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s+(?=(?:trong|trong san|phong trong|con trong|dang trong|available|phong|ma phong|ma)\b)/,
    ""
  );

  if (/^\d+[a-z]?(?:\/\d+[a-z]?)+\b/.test(withoutLeadingDate)) {
    return "";
  }

  const blocked = /^(?:dia chi|quy mo|toa nha|dien|nuoc|xe|phi|dich vu|coc|hoa hong|hh|hop dong|hd|thu cung|khach nuoc ngoai|so luong nguoi|hotline)\b/.test(
    normalized
  );

  if (blocked) return "";

  /*
   * Marker thực tế trong các nhóm có thể bắt đầu bằng:
   *   Trống mã 902 giá 4tr8
   *   Trống mã 503 + 803 giá 6tr
   *   Trống phòng P202 - 4,9tr
   *   Còn trống 301 giá 5tr
   *
   * Prefix này chỉ bỏ phần trạng thái/nhãn. Mã chính vẫn là token
   * đầu tiên; trường hợp "503 + 803" được giữ nguyên trong markerText
   * nhưng dùng 503 làm mã đại diện cho một record/album chung.
   */
  const withoutVacancyPrefix = withoutLeadingDate
    .replace(
      /^(?:trong|trong san|phong trong|con trong|dang trong|available)\s*(?:san\s*)?(?:(?:phong|ma phong|ma)\s*)?/,
      ""
    )
    .replace(/^(?:phong|ma phong|ma)\s+/, "")
    .trim();

  const special = withoutVacancyPrefix.match(
    /^(tret|lung|san\s*thuong|tang\s*thuong|lau\s*\d{1,2}|tang\s*\d{1,2})\b/
  );

  if (special?.[1]) {
    return special[1].replace(/\s+/g, "").toUpperCase();
  }

  const match = withoutVacancyPrefix.match(
    /^(?:p\s*\.\s*)?([a-z]{0,3}\s*\.?\s*\d{1,4}[a-z]?)\b/
  );

  const raw = String(match?.[1] || "")
    .replace(/[.\s]+/g, "")
    .toUpperCase();

  if (!raw) return "";

  const numberOnly = /^\d+$/.test(raw);
  if (numberOnly && raw.length < 2) return "";

  return raw;
}

export function isRoomMarkerLine(input: unknown) {
  const text = cleanText(input);
  if (!text || text.length > 260) return false;
  if (!hasRoomPrice(text)) return false;

  const roomCode = extractRoomCode(text);
  if (roomCode) return true;

  const normalized = stripLeadingDecorations(text);
  return /^(?:trong|trong san|phong trong|con trong|dang trong|available)\b/.test(
    normalized
  );
}

export function splitTextLines(input: unknown) {
  return cleanText(input)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function isVideoMessage(
  message: SemanticIndexedDbMessage
) {
  return (
    message.msgType === 18 ||
    message.originMsgType === "chat.video.msg" ||
    (Array.isArray(message.videoUrls) &&
      message.videoUrls.some((url) => String(url || "").trim()))
  );
}

export function pickImageUrl(
  message: SemanticIndexedDbMessage
) {
  return String(
    message.imageUrls?.find((url) => String(url || "").trim()) ||
      ""
  ).trim();
}

export function buildAlbums(
  imageMessages: SemanticIndexedDbMessage[]
) {
  const map = new Map<string, SemanticIndexedDbMessage[]>();

  for (const message of imageMessages) {
    const key =
      message.groupLayoutId != null
        ? `album:${String(message.groupLayoutId)}`
        : `single:${String(message.msgId || message.cliMsgId)}`;

    const current = map.get(key) || [];
    current.push(message);
    map.set(key, current);
  }

  return Array.from(map.entries())
    .map(([albumKey, items]) => {
      const sorted = [...items].sort((a, b) => {
        const ai = Number(a.imageIndex);
        const bi = Number(b.imageIndex);

        if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) {
          return ai - bi;
        }

        return messageTimestamp(a) - messageTimestamp(b);
      });

      const expected = sorted
        .map((message) => Number(message.totalImages))
        .filter((value) => Number.isFinite(value) && value > 0);

      const expectedImageCount =
        expected.length > 0 ? Math.max(...expected) : null;

      const imageMessageIds = sorted
        .map((message) => String(message.msgId || "").trim())
        .filter(Boolean);

      const imageUrls = Array.from(
        new Set(sorted.map(pickImageUrl).filter(Boolean))
      );

      const actualImageCount = imageMessageIds.length;

      const album: SemanticAlbumPreview = {
        albumKey,
        groupLayoutId: sorted[0]?.groupLayoutId ?? null,
        expectedImageCount,
        actualImageCount,
        complete:
          expectedImageCount == null ||
          actualImageCount >= expectedImageCount,
        imageMessageIds,
        imageUrls,
      };

      return {
        album,
        firstTimestamp:
          sorted.length > 0
            ? Math.min(...sorted.map(messageTimestamp))
            : 0,
      };
    })
    .sort((a, b) => a.firstTimestamp - b.firstTimestamp)
    .map((item) => item.album);
}

export function getVideoPayload(
  message: SemanticIndexedDbMessage
): SemanticVideoPayload | null {
  const sourceUrl = String(
    message.videoUrls?.find((url) => String(url || "").trim()) ||
      ""
  ).trim();

  if (!sourceUrl) return null;

  const thumbnailUrl = String(
    message.videoThumbUrls?.find((url) =>
      String(url || "").trim()
    ) || ""
  ).trim();

  const durationMs = Number(message.videoDebug?.durationMs || 0);
  const width = Number(message.videoDebug?.width || 0);
  const height = Number(message.videoDebug?.height || 0);
  const sizeBytes = Number(
    message.videoDebug?.fileSize ||
      message.videoDebug?.sizeBytes ||
      0
  );

  return {
    sourceUrl,
    thumbnailUrl: thumbnailUrl || undefined,
    durationMs:
      Number.isFinite(durationMs) && durationMs > 0
        ? durationMs
        : undefined,
    width:
      Number.isFinite(width) && width > 0 ? width : undefined,
    height:
      Number.isFinite(height) && height > 0 ? height : undefined,
    sizeBytes:
      Number.isFinite(sizeBytes) && sizeBytes > 0
        ? sizeBytes
        : undefined,
  };
}

export function sha256(input: unknown) {
  return crypto
    .createHash("sha256")
    .update(String(input || ""))
    .digest("hex");
}
