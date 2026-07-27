"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { readApiResponse } from "@/lib/api/client";

type EditableProperty = {
  id: string;
  code?: string | null;
  name?: string | null;
  house_number: string;
  address: string;
  ward?: string | null;
  district: string;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
  cover_image?: string | null;
  note?: string | null;
  approval_status?: string | null;
};

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-600 focus:ring-2 focus:ring-gray-200";

export default function EditPropertyForm({
  property,
}: {
  property: EditableProperty;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/owner/properties/${property.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: property.code,
          name: form.get("name"),
          house_number: form.get("house_number"),
          address: form.get("address"),
          ward: form.get("ward"),
          district: form.get("district"),
          city: form.get("city"),
          latitude: form.get("latitude"),
          longitude: form.get("longitude"),
          cover_image: form.get("cover_image"),
          note: form.get("note"),
        }),
      });

      await readApiResponse<unknown>(response);
      router.push(`/owner/properties/${property.id}`);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Không thể cập nhật tòa nhà",
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
        <Field label="Tên tòa nhà" htmlFor="name">
          <input
            id="name"
            name="name"
            className={INPUT_CLASS}
            maxLength={200}
            defaultValue={property.name ?? ""}
          />
        </Field>

        <Field label="Mã tòa nhà" htmlFor="code" hint="Mã hệ thống không được sửa tại Owner Portal">
          <input
            id="code"
            className={`${INPUT_CLASS} bg-gray-100 text-gray-500`}
            value={property.code ?? ""}
            readOnly
          />
        </Field>

        <Field label="Số nhà" htmlFor="house_number" required>
          <input
            id="house_number"
            name="house_number"
            className={INPUT_CLASS}
            maxLength={100}
            defaultValue={property.house_number}
            required
          />
        </Field>

        <Field label="Tên đường / địa chỉ" htmlFor="address" required>
          <input
            id="address"
            name="address"
            className={INPUT_CLASS}
            maxLength={500}
            defaultValue={property.address}
            required
          />
        </Field>

        <Field label="Phường / xã" htmlFor="ward">
          <input
            id="ward"
            name="ward"
            className={INPUT_CLASS}
            maxLength={120}
            defaultValue={property.ward ?? ""}
          />
        </Field>

        <Field label="Quận / huyện" htmlFor="district" required>
          <input
            id="district"
            name="district"
            className={INPUT_CLASS}
            maxLength={120}
            defaultValue={property.district}
            required
          />
        </Field>

        <Field label="Tỉnh / thành phố" htmlFor="city" required>
          <input
            id="city"
            name="city"
            className={INPUT_CLASS}
            maxLength={120}
            defaultValue={property.city}
            required
          />
        </Field>

        <Field label="URL ảnh đại diện" htmlFor="cover_image">
          <input
            id="cover_image"
            name="cover_image"
            type="url"
            className={INPUT_CLASS}
            maxLength={2000}
            defaultValue={property.cover_image ?? ""}
          />
        </Field>

        <Field label="Vĩ độ" htmlFor="latitude">
          <input
            id="latitude"
            name="latitude"
            type="number"
            step="any"
            min={-90}
            max={90}
            className={INPUT_CLASS}
            defaultValue={property.latitude ?? ""}
          />
        </Field>

        <Field label="Kinh độ" htmlFor="longitude">
          <input
            id="longitude"
            name="longitude"
            type="number"
            step="any"
            min={-180}
            max={180}
            className={INPUT_CLASS}
            defaultValue={property.longitude ?? ""}
          />
        </Field>
      </div>

      <Field label="Ghi chú" htmlFor="note">
        <textarea
          id="note"
          name="note"
          className={`${INPUT_CLASS} min-h-28 resize-y`}
          maxLength={5000}
          defaultValue={property.note ?? ""}
        />
      </Field>

      {property.approval_status === "pending" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Tòa nhà đang chờ duyệt. Cập nhật nội dung không làm thay đổi trạng thái
          phê duyệt hiện tại.
        </div>
      ) : null}

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
          {submitting ? "Đang lưu..." : "Lưu thay đổi"}
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
