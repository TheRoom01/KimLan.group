const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RequestValidationError extends Error {
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "RequestValidationError";
    this.details = details;
  }
}

export type JsonObject = Record<string, unknown>;

export async function readJsonObject(request: Request): Promise<JsonObject> {
  const body: unknown = await request.json();

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestValidationError("Dữ liệu gửi lên phải là JSON object");
  }

  return body as JsonObject;
}

export function parseUuid(value: unknown, fieldName: string): string {
  const parsed = String(value ?? "").trim();

  if (!UUID_PATTERN.test(parsed)) {
    throw new RequestValidationError(`${fieldName} không hợp lệ`, {
      field: fieldName,
    });
  }

  return parsed;
}

export function parseRequiredString(
  value: unknown,
  fieldName: string,
  maxLength = 255,
): string {
  const parsed = String(value ?? "").trim();

  if (!parsed) {
    throw new RequestValidationError(`${fieldName} là bắt buộc`, {
      field: fieldName,
    });
  }

  if (parsed.length > maxLength) {
    throw new RequestValidationError(
      `${fieldName} không được vượt quá ${maxLength} ký tự`,
      { field: fieldName, maxLength },
    );
  }

  return parsed;
}

export function parseOptionalString(
  value: unknown,
  fieldName: string,
  maxLength = 2000,
): string | null {
  if (value === null || value === undefined) return null;

  const parsed = String(value).trim();

  if (parsed.length > maxLength) {
    throw new RequestValidationError(
      `${fieldName} không được vượt quá ${maxLength} ký tự`,
      { field: fieldName, maxLength },
    );
  }

  return parsed || null;
}

export function parseNonNegativeInteger(
  value: unknown,
  fieldName: string,
  options: { optional?: boolean } = {},
): number | null {
  if (
    options.optional &&
    (value === null || value === undefined || value === "")
  ) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new RequestValidationError(
      `${fieldName} phải là số nguyên không âm`,
      { field: fieldName },
    );
  }

  return parsed;
}

export function parseDate(value: unknown, fieldName: string): string {
  const parsed = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
    throw new RequestValidationError(
      `${fieldName} phải theo định dạng YYYY-MM-DD`,
      { field: fieldName },
    );
  }

  const date = new Date(`${parsed}T00:00:00Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== parsed
  ) {
    throw new RequestValidationError(`${fieldName} không hợp lệ`, {
      field: fieldName,
    });
  }

  return parsed;
}

export function assertDateRange(startDate: string, endDate: string) {
  if (startDate > endDate) {
    throw new RequestValidationError(
      "Ngày bắt đầu không được sau ngày kết thúc",
      { fields: ["start_date", "end_date"] },
    );
  }
}
