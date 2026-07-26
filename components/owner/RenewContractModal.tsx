"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { readApiResponse } from "@/lib/api/client";

function addOneYear(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

export default function RenewContractModal({
  contractId,
  currentPrice,
  currentStartDate,
  currentEndDate,
}: {
  contractId: string;
  currentPrice: number;
  currentStartDate: string;
  currentEndDate: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    start_date: currentStartDate,
    end_date: addOneYear(currentEndDate),
    monthly_price: currentPrice,
  });
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submit() {
    try {
      setLoading(true);
      setErrorMessage(null);

      const response = await fetch(
        `/api/owner/contracts/${contractId}/renew`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        },
      );

      await readApiResponse(response);
      setOpen(false);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Gia hạn hợp đồng thất bại",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-blue-600 px-4 py-2 text-white"
      >
        Gia hạn hợp đồng
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-4 rounded-xl bg-white p-6">
            <h2 className="text-xl font-semibold">Gia hạn hợp đồng</h2>

            {errorMessage && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            <div>
              <label htmlFor="renew_price">Giá thuê mới</label>
              <input
                id="renew_price"
                type="number"
                min={0}
                className="w-full rounded border p-2"
                value={form.monthly_price}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    monthly_price: Number(event.target.value),
                  }))
                }
              />
            </div>

            <div>
              <label htmlFor="renew_start_date">Ngày bắt đầu</label>
              <input
                id="renew_start_date"
                type="date"
                className="w-full rounded border p-2"
                value={form.start_date}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    start_date: event.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label htmlFor="renew_end_date">Ngày kết thúc</label>
              <input
                id="renew_end_date"
                type="date"
                className="w-full rounded border p-2"
                value={form.end_date}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    end_date: event.target.value,
                  }))
                }
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={loading}
                className="rounded border px-4 py-2"
              >
                Hủy
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={submit}
                className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
              >
                {loading ? "Đang lưu..." : "Xác nhận"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
