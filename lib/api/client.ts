export type ApiResponse<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: {
        code?: string;
        message?: string;
        details?: unknown;
      };
    };

export async function readApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | ApiResponse<T>
    | null;

  if (!response.ok || !payload || payload.ok !== true) {
    const message =
      payload && payload.ok === false
        ? payload.error?.message
        : null;

    throw new Error(
      message || `Yêu cầu thất bại (${response.status})`,
    );
  }

  return payload.data;
}
