import { NextResponse } from "next/server";


export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "DATABASE_ERROR";


export function apiSuccess<T>(
  data: T,
  status = 200
) {

  return NextResponse.json(
    {
      ok: true,
      data,
    },
    {
      status,
    }
  );
}


export function apiError(
  code: ApiErrorCode,
  message: string,
  status = 400,
  details?: unknown
) {

  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        details,
      },
    },
    {
      status,
    }
  );
}


export function mapDatabaseError(
  error: any
) {

  const message =
    error?.message ??
    "Database error";


  if (
    message.includes("FORBIDDEN") ||
    message.includes("permission")
  ) {

    return apiError(
      "FORBIDDEN",
      "Bạn không có quyền thực hiện thao tác này",
      403
    );
  }


  if (
    message.includes("NOT_FOUND")
  ) {

    return apiError(
      "NOT_FOUND",
      "Không tìm thấy dữ liệu",
      404
    );
  }


  if (
    message.includes("CONFLICT")
  ) {

    return apiError(
      "CONFLICT",
      "Dữ liệu bị xung đột",
      409
    );
  }


  if (
    message.includes("INVALID_INPUT")
  ) {

    return apiError(
      "INVALID_INPUT",
      "Dữ liệu không hợp lệ",
      400
    );
  }


  return apiError(
    "DATABASE_ERROR",
    message,
    500
  );
}