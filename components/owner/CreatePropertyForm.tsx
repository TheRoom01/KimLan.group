"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { readApiResponse } from "@/lib/api/client";

type CreatePropertyResult = {
  mode:
    | "created"
    | "request_pending";

  property_id?: string;

  request_id?: string;

  message?: string;
};

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-600 focus:ring-2 focus:ring-gray-200";

export default function CreatePropertyForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      house_number: form.get("house_number"),
      address: form.get("address"),
      ward: form.get("ward"),
      district: form.get("district"),
      city: form.get("city"),
      note: form.get("note"),
    };

    try {
      const response = await fetch("/api/owner/properties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result =
        await readApiResponse<CreatePropertyResult>(
          response,
        );


      if (
        result.mode === "created"
      ) {

        if (!result.property_id) {
          throw new Error(
            "Không nhận được mã tòa nhà mới",
          );
        }


        router.push(
          `/owner/properties/${result.property_id}`,
        );


      } else if (
        result.mode === "request_pending"
      ) {


        alert(
          "Tòa nhà này đã tồn tại. Yêu cầu đồng sở hữu đã được gửi tới chủ sở hữu hiện tại để duyệt.",
        );


        router.push(
          "/owner/properties",
        );


      } else {


        throw new Error(
          result.message ||
          "Phản hồi không hợp lệ từ hệ thống",
        );

      }


      router.refresh();

    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Không thể tạo tòa nhà",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border bg-white p-6 shadow-sm"
    >
      <div className="grid gap-5 md:grid-cols-2">
        
        <Field label="Số nhà" htmlFor="house_number" required>
          <input
            id="house_number"
            name="house_number"
            className={INPUT_CLASS}
            maxLength={100}
            required
          />
        </Field>

        <Field label="Tên đường / địa chỉ" htmlFor="address" required>
          <input
            id="address"
            name="address"
            className={INPUT_CLASS}
            maxLength={500}
            required
          />
        </Field>

        <Field label="Phường / xã" htmlFor="ward">
          <input
            id="ward"
            name="ward"
            className={INPUT_CLASS}
            maxLength={120}
          />
        </Field>

        <Field label="Quận / huyện" htmlFor="district" required>
          <input
            id="district"
            name="district"
            className={INPUT_CLASS}
            maxLength={120}
            required
          />
        </Field>

        <Field label="Tỉnh / thành phố" htmlFor="city" required>
          <input
            id="city"
            name="city"
            className={INPUT_CLASS}
            maxLength={120}
            defaultValue="Hồ Chí Minh"
            required
          />
        </Field>
      
      </div>

      <Field label="Ghi chú" htmlFor="note">
        <textarea
          id="note"
          name="note"
          className={`${INPUT_CLASS} min-h-28 resize-y`}
          maxLength={5000}
        />
      </Field>

      
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={submitting}
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          Hủy
        </button>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Đang tạo..." : "Tạo tòa nhà"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required = false,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-800">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}
