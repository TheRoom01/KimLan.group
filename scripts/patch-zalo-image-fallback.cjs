const fs = require('node:fs');
const path = require('node:path');

const filePath = path.join(process.cwd(), 'tools/zalo-reader/parsers/media-matcher.ts');
let source = fs.readFileSync(filePath, 'utf8');

const helperAnchor = `export type MediaAssignmentResult = {
  inferredBias: Exclude<SemanticMediaBias, "auto">;
  assignedByRoomId: Map<string, MediaBundle[]>;
  warningsByRoomId: Map<string, Set<string>>;
  unassignedBundles: MediaBundle[];
};
`;

const helper = `${helperAnchor}
/*
 * Một số phiên bản Zalo vẫn có URL ảnh nhưng không gắn kind = "image",
 * hoặc URL nằm ở field dự phòng/DOM hydration. Chuẩn hóa cục bộ tại tầng
 * media để không thay đổi logic ghép album và phòng hiện có.
 */
function getFallbackImageUrls(message: SemanticIndexedDbMessage) {
  const raw = message as any;

  const candidates = [
    ...(Array.isArray(raw.imageUrls) ? raw.imageUrls : []),
    raw.hdUrl,
    raw.originalUrl,
    raw.originUrl,
    raw.normalUrl,
    raw.imageUrl,
    raw.photoUrl,
    raw.thumbUrl,
    raw.thumbnailUrl,
    raw.content?.hdUrl,
    raw.content?.originalUrl,
    raw.content?.originUrl,
    raw.content?.url,
    raw.content?.href,
    raw.params?.hdUrl,
    raw.params?.url,
    ...(Array.isArray(raw.domHydration?.imageUrls)
      ? raw.domHydration.imageUrls
      : []),
  ];

  return Array.from(
    new Set(
      candidates
        .map((value) => String(value || "").trim())
        .filter((url) => {
          if (!url) return false;
          if (!/^(?:https?:|blob:|file:)/i.test(url)) return false;

          const lower = url.toLowerCase();
          return !(
            lower.includes("avatar") ||
            lower.includes("sticker") ||
            lower.includes("emoji") ||
            lower.includes("reaction") ||
            lower.includes("icon") ||
            lower.includes("logo")
          );
        })
    )
  );
}

function normalizeImageMessage(message: SemanticIndexedDbMessage) {
  const imageUrls = getFallbackImageUrls(message);
  if (imageUrls.length === 0) return message;

  return {
    ...message,
    kind: "image" as const,
    imageUrls,
  };
}
`;

if (!source.includes('function getFallbackImageUrls(')) {
  if (!source.includes(helperAnchor)) {
    throw new Error('Không tìm thấy vị trí thêm helper media fallback.');
  }
  source = source.replace(helperAnchor, helper);
}

const oldBlock = `  const imageMessages = messages.filter(
    (message) =>
      message.kind === "image" && Boolean(pickImageUrl(message))
  );`;

const newBlock = `  const imageMessages = messages
    .map(normalizeImageMessage)
    .filter((message) => Boolean(pickImageUrl(message)));`;

if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock);
} else if (!source.includes('.map(normalizeImageMessage)')) {
  throw new Error('Không tìm thấy block imageMessages cần thay.');
}

fs.writeFileSync(filePath, source, 'utf8');
console.log('Patched Zalo image fallback safely.');
