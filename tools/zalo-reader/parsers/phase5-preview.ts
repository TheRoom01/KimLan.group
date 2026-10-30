import crypto from "node:crypto";

export const PHASE5_PREVIEW_GROUP_NAME =
  "Giỏ Hàng Căn Hộ Q1,Q3,Q10 🏠";
export const PREVIEW_LOGIN_WAIT_MS = 120_000;

export async function waitForUiReady(params: {
  probe: () => Promise<boolean>;
  sleep: (milliseconds: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
}) {
  const now = params.now || Date.now;
  const requestedTimeout = Number(params.timeoutMs ?? PREVIEW_LOGIN_WAIT_MS);
  const timeoutMs = Number.isFinite(requestedTimeout)
    ? Math.max(0, Math.min(PREVIEW_LOGIN_WAIT_MS, requestedTimeout))
    : PREVIEW_LOGIN_WAIT_MS;
  const deadline = now() + timeoutMs;

  while (true) {
    if (await params.probe()) return;
    const remaining = deadline - now();
    if (remaining <= 0) {
      throw new Error(
        `Zalo Web chưa sẵn sàng sau ${Math.round(timeoutMs / 1000)} giây. Không xác nhận được trạng thái đăng nhập hoặc selector ô tìm nhóm.`
      );
    }
    await params.sleep(Math.min(1000, remaining));
  }
}

export type PreviewTimestampStatus =
  | "trusted"
  | "missing_or_untrusted_timestamp";

export type PreviewTimestampResult = {
  status: PreviewTimestampStatus;
  source: "sendDttm" | "serverTime" | null;
  sourceValue: unknown;
  timestampMs: number | null;
  inWindow: boolean;
  exclusionReason?: string;
};

export type PreviewFilterResult<T extends Record<string, any>> = {
  messages: Array<T & { __previewTimestamp: PreviewTimestampResult }>;
  decisions: Array<{
    message: T;
    timestamp: PreviewTimestampResult;
  }>;
  cutoffMs: number;
  endMs: number;
};

export function sanitizePreviewText(value: unknown) {
  return String(value ?? "")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(
      /(cookie|set-cookie|authorization|bearer|token|secret|api[_-]?key|password|mật\s*khẩu|mat\s*khau)(\s*[:=]\s*)([^\r\n]*)/gi,
      "$1$2[REDACTED]"
    )
    .replace(/https?:\/\/[^\s)]+/gi, (rawUrl) => {
      try {
        const url = new URL(rawUrl);
        return `${url.origin}${url.pathname}`;
      } catch {
        return "[URL_REDACTED]";
      }
    });
}

const MIN_TRUSTED_EPOCH_MS = Date.UTC(2000, 0, 1);
const MAX_TRUSTED_EPOCH_MS = Date.UTC(2100, 0, 1);

function parseEpochMilliseconds(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }

  const raw = String(value).trim();
  if (!/^\d{13}$/.test(raw)) return null;

  const timestamp = Number(raw);
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < MIN_TRUSTED_EPOCH_MS ||
    timestamp >= MAX_TRUSTED_EPOCH_MS
  ) {
    return null;
  }

  return timestamp;
}

export function resolveTrustedMessageTimestamp(
  message: Record<string, any>
): Omit<PreviewTimestampResult, "inWindow"> {
  const supplied: Array<{
    source: "sendDttm" | "serverTime";
    raw: unknown;
  }> = [];

  for (const source of ["sendDttm", "serverTime"] as const) {
    const raw = message?.[source];
    if (raw === null || raw === undefined || raw === "" || raw === 0 || raw === "0") {
      continue;
    }
    supplied.push({ source, raw });
  }

  if (supplied.length === 0) {
    return {
      status: "missing_or_untrusted_timestamp",
      source: null,
      sourceValue: null,
      timestampMs: null,
      exclusionReason: "missing_or_untrusted_timestamp",
    };
  }

  const parsed = supplied.map((item) => ({
    ...item,
    timestampMs: parseEpochMilliseconds(item.raw),
  }));

  if (parsed.some((item) => item.timestampMs === null)) {
    return {
      status: "missing_or_untrusted_timestamp",
      source: null,
      sourceValue: supplied.map((item) => ({
        source: item.source,
        value: item.raw,
      })),
      timestampMs: null,
      exclusionReason: "invalid_timestamp_unit_or_value",
    };
  }

  const first = parsed[0];
  if (!first || first.timestampMs === null) {
    return {
      status: "missing_or_untrusted_timestamp",
      source: null,
      sourceValue: null,
      timestampMs: null,
      exclusionReason: "missing_or_untrusted_timestamp",
    };
  }

  if (parsed.some((item) => item.timestampMs !== first.timestampMs)) {
    return {
      status: "missing_or_untrusted_timestamp",
      source: null,
      sourceValue: supplied.map((item) => ({
        source: item.source,
        value: item.raw,
      })),
      timestampMs: null,
      exclusionReason: "conflicting_message_timestamps",
    };
  }

  return {
    status: "trusted",
    source: first.source,
    sourceValue: first.raw,
    timestampMs: first.timestampMs,
  };
}

export function filterMessagesForPreview<T extends Record<string, any>>(
  messages: T[],
  startedAtMs: number,
  lookbackMs = 24 * 60 * 60 * 1000
): PreviewFilterResult<T> {
  if (!Number.isSafeInteger(startedAtMs) || startedAtMs <= 0) {
    throw new Error("Preview requires one valid Reader start epoch (T0).");
  }

  if (!Number.isSafeInteger(lookbackMs) || lookbackMs <= 0) {
    throw new Error("Preview lookback must be a positive integer in milliseconds.");
  }

  const cutoffMs = startedAtMs - lookbackMs;
  const decisions = (messages || []).map((message) => {
    const resolved = resolveTrustedMessageTimestamp(message);
    let timestamp: PreviewTimestampResult;

    if (resolved.status !== "trusted" || resolved.timestampMs === null) {
      timestamp = {
        ...resolved,
        inWindow: false,
      };
    } else if (resolved.timestampMs < cutoffMs) {
      timestamp = {
        ...resolved,
        inWindow: false,
        exclusionReason: "outside_24_hour_window_before_cutoff",
      };
    } else if (resolved.timestampMs > startedAtMs) {
      timestamp = {
        ...resolved,
        inWindow: false,
        exclusionReason: "after_reader_start_time",
      };
    } else {
      timestamp = {
        ...resolved,
        inWindow: true,
      };
    }

    return { message, timestamp };
  });

  return {
    messages: decisions
      .filter((item) => item.timestamp.inWindow)
      .map(({ message, timestamp }) => ({
        ...message,
        __previewTimestamp: timestamp,
        strictTimestampOnly: true,
        trustedTimestampMs: timestamp.timestampMs,
      })),
    decisions,
    cutoffMs,
    endMs: startedAtMs,
  };
}

export function isReaderImportAllowed(
  previewOnly: unknown,
  importEnabled: unknown
) {
  const previewModeValid =
    previewOnly === true ||
    previewOnly === false ||
    previewOnly === undefined;
  return (
    previewModeValid &&
    previewOnly !== true &&
    importEnabled === true
  );
}

export function hashPreviewReference(groupName: string, messageId: unknown) {
  return crypto
    .createHash("sha256")
    .update(`${groupName}|${String(messageId ?? "")}`)
    .digest("hex")
    .slice(0, 16);
}

