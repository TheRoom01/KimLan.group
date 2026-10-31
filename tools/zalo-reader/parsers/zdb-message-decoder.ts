export type ZdbMessagePayload = {
  isJson: boolean;
  value: unknown;
  text: string;
};

/** Parse JSON only when the whole IndexedDB string is valid JSON. */
export function decodeZdbMessagePayload(raw: unknown): ZdbMessagePayload {
  let value = raw;
  let isJson = false;
  if (typeof raw === "string") {
    if (!raw.trim()) return { isJson: false, value: raw, text: "" };
    try {
      value = JSON.parse(raw);
      isJson = true;
    } catch {
      // Keep ordinary text exactly as stored, including whitespace/newlines.
      return { isJson: false, value: raw, text: raw };
    }
  }
  if (typeof value === "string") return { isJson, value, text: value };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    const textValue = [object.text, object.content, object.caption, object.body]
      .find((candidate) => typeof candidate === "string" && candidate.trim());
    return { isJson, value, text: typeof textValue === "string" ? textValue : "" };
  }
  return { isJson, value, text: "" };
}

export type ZdbLookupResult<T> = {
  record: T | null;
  matchedBy: "msgId" | "cliMsgId" | "none";
};

/** Preserve separate ID namespaces: primary msgId first, then cliMsgId index. */
export async function lookupZdbMessageRecord<T>(input: {
  msgId?: unknown;
  cliMsgId?: unknown;
  getByMsgId: (key: string) => Promise<T | null | undefined>;
  getByCliMsgId: (key: string) => Promise<T | null | undefined>;
}): Promise<ZdbLookupResult<T>> {
  const msgId = String(input.msgId ?? "").trim();
  const cliMsgId = String(input.cliMsgId ?? "").trim();

  if (msgId) {
    const byMsgId = await input.getByMsgId(msgId);
    if (byMsgId) return { record: byMsgId, matchedBy: "msgId" };
  }
  if (cliMsgId) {
    const byCliMsgId = await input.getByCliMsgId(cliMsgId);
    if (byCliMsgId) return { record: byCliMsgId, matchedBy: "cliMsgId" };
  }
  return { record: null, matchedBy: "none" };
}

/** Install these exact tested helpers in page.evaluate's separate JS realm. */
export function timestampIndexWindowKeys(sample: unknown, groupId: string, fromMs: number, toMs: number) {
  const value = Number(sample);
  if (!Number.isSafeInteger(value) || value < 1e12 || value > 1e13 || !Number.isSafeInteger(fromMs) || !Number.isSafeInteger(toMs) || fromMs > toMs) throw new Error("TIMESTAMP_INDEX_KEY_UNSUPPORTED");
  if (typeof sample !== "number" && !(typeof sample === "string" && /^\d{13}$/.test(sample))) throw new Error("TIMESTAMP_INDEX_KEY_UNSUPPORTED");
  const from = typeof sample === "string" ? String(fromMs) : fromMs;
  const to = typeof sample === "string" ? String(toMs) : toMs;
  return { lower: [groupId, from], upper: [groupId, to, []], before: [groupId, from] };
}
export function zdbMessageBrowserScript() {
  return `globalThis.__zaloZdbMessageTools = {
    decodeZdbMessagePayload: (${decodeZdbMessagePayload.toString()}),
    lookupZdbMessageRecord: (${lookupZdbMessageRecord.toString()}),
    timestampIndexWindowKeys: (${timestampIndexWindowKeys.toString()})
  };`;
}

/**
 * Metadata-only timeline records must never reach the strict staging parser.
 * Zalo may keep ciphertext in zdb while rendering decrypted content in the DOM.
 * DOM content is accepted only when the bubble ID directly matched msgId/cliMsgId;
 * approximate timestamp hydration remains preview-only.
 */
export function hasVerifiedZdbContent(message: Record<string, unknown>) {
  const sourceVerified = message.contentSource === "zdb" || (
    message.contentSource === "dom" &&
    Boolean((message.domHydration as Record<string, unknown> | undefined)?.verifiedById)
  );
  if (!sourceVerified) return false;
  if (typeof message.text === "string" && message.text.trim()) return true;
  return [message.imageUrls, message.videoUrls, message.videoThumbUrls].some(
    (urls) => Array.isArray(urls) && urls.some(
      (url) => typeof url === "string" && url.trim(),
    ),
  );
}
