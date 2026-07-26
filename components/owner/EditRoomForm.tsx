"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { readApiResponse } from "@/lib/api/client";

interface Props {
  room: {
    id: string;
    room_type?: string | null;
    price?: number | null;
    description?: string | null;
  };
}

export default function EditRoomForm({ room }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    room_type: room.room_type ?? "",
    price: room.price ?? 0,
    description: room.description ?? "",
  });

  async function submit() {
    try {
      setLoading(true);
      setErrorMessage(null);

      const response = await fetch(`/api/owner/rooms/${room.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      await readApiResponse(response);

      router.push(`/owner/rooms/${room.id}`);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Cập nhật phòng thất bại",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5 rounded-xl border bg-white p-6">
      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div>
        <label htmlFor="room_type">Loại phòng</label>
        <input
          id="room_type"
          className="mt-1 w-full rounded-lg border p-2"
          value={form.room_type}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              room_type: event.target.value,
            }))
          }
        />
      </div>

      <div>
        <label htmlFor="price">Giá phòng</label>
        <input
          id="price"
          type="number"
          min={0}
          className="mt-1 w-full rounded-lg border p-2"
          value={form.price}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              price: Number(event.target.value),
            }))
          }
        />
      </div>

      <div>
        <label htmlFor="description">Mô tả</label>
        <textarea
          id="description"
          className="mt-1 w-full rounded-lg border p-2"
          rows={5}
          value={form.description}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              description: event.target.value,
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
        {loading ? "Đang lưu..." : "Lưu thay đổi"}
      </button>
    </div>
  );
}
