import { createHash } from "crypto";

import type {
  IncomingZaloReaderIssue,
  ZaloImportIssue,
} from "./types";

export function hasValidZaloReaderSecret(request: Request) {
  const expected =
    process.env.ZALO_READER_INTERNAL_SECRET || "";
  const received =
    request.headers.get("x-internal-secret") || "";

  return Boolean(
    expected && received && expected === received
  );
}

export function makeZaloSourceHash(input: {
  groupName: string;
  senderName: string;
  rawText: string;
  sentAt?: string | null;
  sourceMessageId?: string | null;
}) {
  return createHash("sha256")
    .update(
      [
        input.groupName,
        input.senderName,
        input.sourceMessageId || "",
        input.sentAt || "",
        input.rawText,
      ].join("|")
    )
    .digest("hex");
}

export function sanitizePostgrestString(input: string) {
  let output = "";

  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index);

    if (code === 0) continue;

    if (code >= 0xd800 && code <= 0xdbff) {
      const nextCode = input.charCodeAt(index + 1);

      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        output += input[index] + input[index + 1];
        index++;
      } else {
        output += "\uFFFD";
      }

      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) {
      output += "\uFFFD";
      continue;
    }

    output += input[index];
  }

  return output;
}

function toPostgrestJsonValue(
  value: unknown,
  seen = new WeakSet<object>()
): unknown {
  if (value === null) return null;

  const valueType = typeof value;

  if (valueType === "string") {
    return sanitizePostgrestString(value as string);
  }

  if (valueType === "number") {
    return Number.isFinite(value as number) ? value : null;
  }

  if (valueType === "boolean") return value;
  if (valueType === "bigint") return String(value);

  if (
    valueType === "undefined" ||
    valueType === "function" ||
    valueType === "symbol"
  ) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value.toISOString();
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) return null;
    seen.add(value);

    if (Array.isArray(value)) {
      const output = value.map((item) =>
        toPostgrestJsonValue(item, seen)
      );
      seen.delete(value);
      return output;
    }

    const output: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(value)) {
      const childType = typeof child;

      if (
        childType === "undefined" ||
        childType === "function" ||
        childType === "symbol"
      ) {
        continue;
      }

      output[sanitizePostgrestString(key)] =
        toPostgrestJsonValue(child, seen);
    }

    seen.delete(value);
    return output;
  }

  return null;
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function makePostgrestPayload<T>(
  value: T,
  label: string
): T {
  try {
    const safeValue = toPostgrestJsonValue(value);
    const serialized = JSON.stringify(safeValue);

    if (!serialized || serialized === "null") {
      throw new Error("Payload JSON bị rỗng");
    }

    return JSON.parse(serialized) as T;
  } catch (error) {
    throw new Error(`${label}: ${getErrorMessage(error)}`);
  }
}

export function getErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") return null;

  const candidate = error as Record<string, unknown>;

  return {
    name: candidate.name ?? null,
    code: candidate.code ?? null,
    message: candidate.message ?? null,
    details: candidate.details ?? null,
    hint: candidate.hint ?? null,
    status: candidate.status ?? null,
  };
}

export function toPositiveInt(value: unknown): number | null {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed);
}

export function toNonNegativeInt(
  value: unknown,
  fallback: number
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.round(parsed);
}

export function normalizeReaderIssues(
  value: unknown
): ZaloImportIssue[] {
  if (!Array.isArray(value)) return [];

  return (value as IncomingZaloReaderIssue[])
    .slice(0, 100)
    .map((issue, position): ZaloImportIssue => {
      const rawIndex = Number(issue?.index);

      return {
        level:
          issue?.level === "warning" ? "warning" : "error",
        stage: "reader",
        index: Number.isFinite(rawIndex)
          ? Math.round(rawIndex)
          : position,
        message: String(
          issue?.message || "Reader báo lỗi không xác định"
        ).trim(),
        sourceUrl: issue?.sourceUrl
          ? String(issue.sourceUrl).trim()
          : null,
      };
    });
}
