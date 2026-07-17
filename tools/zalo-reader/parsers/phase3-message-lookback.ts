export type MessageLookbackStats = {
  total: number;
  included: number;
  excludedTooOld: number;
  excludedFuture: number;
  excludedUnknownTimestamp: number;
  lookbackHours: number;
  cutoffMs: number;
  nowMs: number;
};

const MIN_REASONABLE_TIMESTAMP_MS =
  Date.UTC(2020, 0, 1);

const DEFAULT_FUTURE_SKEW_MS =
  5 * 60 * 1000;

function numericValue(input: unknown) {
  const value = Number(input);
  return Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function normalizeEpochValue(
  input: unknown,
  options?: {
    allowMicroseconds?: boolean;
    cliMessageId?: boolean;
  }
) {
  let value = numericValue(input);
  if (value <= 0) return 0;

  /*
   * cliMsgId chỉ được coi là timestamp khi có độ dài giống
   * Unix seconds hoặc Unix milliseconds. ID dài hơn không được
   * tự suy diễn thành thời gian.
   */
  if (options?.cliMessageId) {
    const digits = String(Math.trunc(value)).length;

    if (digits === 10) {
      value *= 1000;
    } else if (digits !== 13) {
      return 0;
    }

    return Math.trunc(value);
  }

  /*
   * Unix seconds.
   */
  if (value >= 1_000_000_000 && value < 10_000_000_000) {
    return Math.trunc(value * 1000);
  }

  /*
   * Unix milliseconds.
   */
  if (value >= 1_000_000_000_000 && value < 10_000_000_000_000) {
    return Math.trunc(value);
  }

  /*
   * Một số payload có thể trả microseconds.
   */
  if (
    options?.allowMicroseconds &&
    value >= 1_000_000_000_000_000 &&
    value < 10_000_000_000_000_000
  ) {
    return Math.trunc(value / 1000);
  }

  return 0;
}

export function getMessageTimestampMs(
  message: Record<string, any>,
  nowMs = Date.now()
) {
  const candidates = [
    normalizeEpochValue(message?.sendDttm, {
      allowMicroseconds: true,
    }),
    normalizeEpochValue(message?.serverTime, {
      allowMicroseconds: true,
    }),
    normalizeEpochValue(message?.cliMsgId, {
      cliMessageId: true,
    }),
    normalizeEpochValue(
      message?.domHydration?.approxTimestamp,
      {
        allowMicroseconds: true,
      }
    ),
  ];

  const latestAllowed =
    nowMs + DEFAULT_FUTURE_SKEW_MS;

  return (
    candidates.find(
      (timestamp) =>
        timestamp >= MIN_REASONABLE_TIMESTAMP_MS &&
        timestamp <= latestAllowed
    ) || 0
  );
}

export function resolveMessageLookbackHours(params?: {
  groupValue?: unknown;
  globalValue?: unknown;
  fallbackHours?: number;
}) {
  const fallback = Number(
    params?.fallbackHours ?? 24
  );

  const candidates = [
    Number(params?.groupValue),
    Number(params?.globalValue),
    fallback,
  ];

  const selected =
    candidates.find(
      (value) =>
        Number.isFinite(value) &&
        value > 0
    ) || 24;

  /*
   * Cho phép cấu hình tối đa 30 ngày, nhưng mặc định luôn là 24 giờ.
   */
  return Math.min(
    24 * 30,
    Math.max(1, selected)
  );
}

export function resolveStrictMessageLookback(params?: {
  groupValue?: unknown;
  globalValue?: unknown;
  fallback?: boolean;
}) {
  if (typeof params?.groupValue === "boolean") {
    return params.groupValue;
  }

  if (typeof params?.globalValue === "boolean") {
    return params.globalValue;
  }

  return params?.fallback !== false;
}

export function filterMessagesByLookback<
  T extends Record<string, any>
>(params: {
  messages: T[];
  lookbackHours?: number;
  nowMs?: number;
  futureSkewMs?: number;
}) {
  const nowMs = Number.isFinite(params.nowMs)
    ? Number(params.nowMs)
    : Date.now();

  const lookbackHours =
    resolveMessageLookbackHours({
      groupValue: params.lookbackHours,
      fallbackHours: 24,
    });

  const futureSkewMs = Math.max(
    0,
    Number(
      params.futureSkewMs ??
        DEFAULT_FUTURE_SKEW_MS
    )
  );

  const cutoffMs =
    nowMs -
    lookbackHours * 60 * 60 * 1000;

  const latestAllowedMs =
    nowMs + futureSkewMs;

  const included: T[] = [];

  let excludedTooOld = 0;
  let excludedFuture = 0;
  let excludedUnknownTimestamp = 0;

  for (const message of params.messages || []) {
    const timestamp = getMessageTimestampMs(
      message,
      nowMs
    );

    if (timestamp <= 0) {
      excludedUnknownTimestamp += 1;
      continue;
    }

    if (timestamp < cutoffMs) {
      excludedTooOld += 1;
      continue;
    }

    if (timestamp > latestAllowedMs) {
      excludedFuture += 1;
      continue;
    }

    included.push(message);
  }

  const stats: MessageLookbackStats = {
    total: (params.messages || []).length,
    included: included.length,
    excludedTooOld,
    excludedFuture,
    excludedUnknownTimestamp,
    lookbackHours,
    cutoffMs,
    nowMs,
  };

  return {
    messages: included,
    stats,
  };
}
