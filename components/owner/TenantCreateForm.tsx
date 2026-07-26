"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { readApiResponse } from "@/lib/api/client";

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function nextYearString() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

export default function TenantCreateForm({
  roomId,
}: {
  roomId: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    cccd: "",
    start_date: todayString(),
    end_date: nextYearString(),
    monthly_price: 0,
    deposit_amount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submit() {
    try {
      setLoading(true);
      setErrorMessage(null);

      const response = await fetch(
        `/api/owner/rooms/${roomId}/tenant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        },
      );

      await readApiResponse(response);

      router.push(`/owner/rooms/${roomId}`);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Tạo hợp đồng thất bại",
      );
    } finally {
      setLoading(false);
    }
  }

  const fields = [
    { key: "full_name", label: "Họ tên", type: "text" },
    { key: "phone", label: "Số điện thoại", type: "tel" },
    { key: "cccd", label: "CCCD", type: "text" },
    { key: "start_date", label: "Ngày bắt đầu", type: "date" },
    { key: "end_date", label: "Ngày kết thúc", type: "date" },
  ] as const;

  return (
    <div className="space-y-5 rounded-xl border bg-white p-6">
      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {fields.map((field) => (
        <div key={field.key}>
          <label htmlFor={field.key}>{field.label}</label>
          <input
            id={field.key}
            className="mt-1 w-full rounded-lg border p-2"
            type={field.type}
            value={form[field.key]}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                [field.key]: event.target.value,
              }))
            }
          />
        </div>
      ))}

      <div>
        <label htmlFor="monthly_price">Giá thuê</label>
        <input
          id="monthly_price"
          type="number"
          min={0}
          className="mt-1 w-full rounded-lg border p-2"
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
        <label htmlFor="deposit_amount">Tiền cọc</label>
        <input
          id="deposit_amount"
          type="number"
          min={0}
          className="mt-1 w-full rounded-lg border p-2"
          value={form.deposit_amount}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              deposit_amount: Number(event.target.value),
            }))
          }
        />
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={loading}
        className="rounded-lg bg-blue-600 px-5 py-2 text-white disabled:opacity-50"
      >
        {loading ? "Đang tạo..." : "Tạo hợp đồng"}
      </button>
    </div>
  );
}
