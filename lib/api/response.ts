import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "DATABASE_ERROR";

export type ApiErrorPayload = {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(
    {
      ok: true as const,
      data,
    },
    { status },
  );
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  status = 400,
  details?: unknown,
) {
  const payload: ApiErrorPayload = {
    ok: false,
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };

  return NextResponse.json(payload, { status });
}

function includesToken(error: unknown, token: string): boolean {
  const candidate = error as {
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };

  return [candidate?.message, candidate?.details, candidate?.hint]
    .map((value) => String(value ?? "").toUpperCase())
    .some((value) => value.includes(token));
}

const DATABASE_MESSAGES:Record<string,string>={


UNAUTHENTICATED:
"Phiên đăng nhập đã hết hạn.",


PROPERTY_PERMISSION_DENIED:
"Bạn không có quyền quản lý tòa nhà này.",


ROOM_CODE_REQUIRED:
"Mã phòng không được để trống.",


ROOM_ALREADY_EXISTS:
"Phòng này đã tồn tại trong tòa nhà. Hệ thống sẽ mở dữ liệu hiện có để bạn chỉnh sửa.",


ROOM_CREATED:
"Tạo phòng thành công."

};

export function mapDatabaseError(error: unknown) {
  
  const databaseError = error as {
    code?: string;
    message?: string;
    details?: string;
  };
  
  
  const code = String(databaseError?.code ?? "");

  if (includesToken(error, "UNAUTHENTICATED")) {
    return apiError(
      "UNAUTHENTICATED",
      "Bạn cần đăng nhập để thực hiện thao tác này",
      401,
    );
  }

  if (
    code === "42501" ||
    includesToken(error, "FORBIDDEN") ||
    includesToken(error, "PERMISSION")
  ) {
    return apiError(
      "FORBIDDEN",
      "Bạn không có quyền thực hiện thao tác này",
      403,
    );
  }

  if (code === "P0002" || includesToken(error, "NOT_FOUND")) {
    return apiError("NOT_FOUND", "Không tìm thấy dữ liệu", 404);
  }

  const databaseMessage =
  DATABASE_MESSAGES[
    String(databaseError?.message ?? "")
  ];

  if (databaseMessage) {
    return apiError(
      "CONFLICT",
      databaseMessage,
      409,
    );
  }


  if (
    code === "P0001" ||
    code === "23505" ||
    code === "23P01" ||
    includesToken(error, "CONFLICT")
  ) {
    return apiError(
      "CONFLICT",
      databaseError?.details || "Dữ liệu bị xung đột",
      409,
    );
  }

  if (
    code === "22023" ||
    code === "22P02" ||
    code === "23514" ||
    includesToken(error, "INVALID_INPUT")
  ) {
    return apiError(
      "INVALID_INPUT",
      databaseError?.details || "Dữ liệu không hợp lệ",
      400,
    );
  }

  console.error("Owner API database error:", error);

  return apiError(
    "DATABASE_ERROR",
    "Không thể xử lý yêu cầu lúc này",
    500,
  );
}

export function mapUnknownError(error: unknown) {
  if (error instanceof SyntaxError) {
    return apiError("INVALID_INPUT", "JSON không hợp lệ", 400);
  }

  if (error instanceof Error && error.name === "RequestValidationError") {
    return apiError(
      "INVALID_INPUT",
      error.message,
      400,
      "details" in error
        ? (error as Error & { details?: unknown }).details
        : undefined,
    );
  }

  console.error("Owner API unexpected error:", error);

  return apiError(
    "DATABASE_ERROR",
    "Không thể xử lý yêu cầu lúc này",
    500,
  );
}

