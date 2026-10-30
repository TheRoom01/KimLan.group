export type ZdbMessagePayload = {
  isJson: boolean;
  value: unknown;
  text: string;
};

/** Parse JSON only when the whole IndexedDB string is valid JSON. */
export function decodeZdbMessagePayload(raw: unknown): ZdbMessagePayload {
  if (typeof raw !== "string") {
    return { isJson: false, value: raw, text: "" };
  }

  const text = raw.trim();
  if (!text) return { isJson: false, value: raw, text: "" };

  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === "string") {
      return { isJson: true, value, text: value.trim() };
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const object = value as Record<string, unknown>;
      const textValue = [object.text, object.content, object.caption, object.body]
        .find((candidate) => typeof candidate === "string" && candidate.trim());
      return {
        isJson: true,
        value,
        text: typeof textValue === "string" ? textValue.trim() : "",
      };
    }
    return { isJson: true, value, text: "" };
  } catch {
    return { isJson: false, value: raw, text: raw };
  }
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
