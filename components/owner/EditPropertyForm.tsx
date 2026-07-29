"use client";

import { ChangeEvent, DragEvent, FormEvent, useState } from "react";
import { GripVertical, ImagePlus, Trash2 } from "lucide-react";
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
  gallery_images?: string[] | null;
  google_maps_url?: string | null;
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
  const [gallery, setGallery] = useState<string[]>(
    property.gallery_images?.length
      ? property.gallery_images
      : property.cover_image
        ? [property.cover_image]
        : [],
  );
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  async function uploadImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setSubmitting(true);
    setError(null);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
          throw new Error("Mỗi ảnh phải là file hình ảnh không quá 10 MB.");
        }
        const presign = await readApiResponse<{ uploadUrl: string; publicUrl: string; requiredHeaders?: Record<string, string> }>(
          await fetch("/api/upload/r2-presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ property_id: property.id, file_name: file.name, content_type: file.type, size: file.size }),
          }),
        );
        const response = await fetch(presign.uploadUrl, { method: "PUT", headers: presign.requiredHeaders, body: file });
        if (!response.ok) throw new Error(`Upload ${file.name} thất bại.`);
        uploaded.push(presign.publicUrl);
      }
      setGallery((current) => [...current, ...uploaded].slice(0, 20));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Không thể upload ảnh tòa nhà");
    } finally {
      setSubmitting(false);
      event.target.value = "";
    }
  }

  function dropImage(event: DragEvent, targetIndex: number) {
    event.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    setGallery((current) => {
      const next = [...current];
      const [moved] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDraggedIndex(null);
  }

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
          cover_image: gallery[0] ?? null,
          gallery_images: gallery,
          google_maps_url: form.get("google_maps_url"),
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

        <Field label="Link Google Maps" htmlFor="google_maps_url">
          <input
            id="google_maps_url"
            name="google_maps_url"
            type="url"
            className={INPUT_CLASS}
            maxLength={2000}
            placeholder="https://maps.google.com/..."
            defaultValue={property.google_maps_url ?? ""}
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

      <section className="space-y-3 rounded-2xl border border-[#aa825d]/25 bg-[#fff9ef] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-bold text-[#4d3422]">Hình ảnh tòa nhà</h2><p className="text-xs text-[#80634a]">Ảnh đầu tiên là ảnh đại diện. Kéo thả để đổi thứ tự.</p></div>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-[#744722] px-4 text-sm font-bold text-white">
            <ImagePlus size={17} /> Thêm ảnh
            <input type="file" multiple accept="image/*" className="hidden" onChange={uploadImages} />
          </label>
        </div>
        {gallery.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {gallery.map((url, index) => <article key={`${url}-${index}`} draggable onDragStart={() => setDraggedIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropImage(event, index)} className="overflow-hidden rounded-xl border bg-white">
            <img src={url} alt={`Ảnh tòa nhà ${index + 1}`} className="h-40 w-full object-cover" />
            <div className="flex items-center justify-between px-3 py-2"><span className="flex items-center gap-1 text-xs font-semibold"><GripVertical size={15} />{index === 0 ? "Ảnh đại diện" : `Ảnh ${index + 1}`}</span><button type="button" onClick={() => setGallery((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-red-700" aria-label="Xóa ảnh"><Trash2 size={16} /></button></div>
          </article>)}
        </div> : <div className="rounded-xl border border-dashed p-8 text-center text-sm text-[#80634a]">Chưa có ảnh tòa nhà.</div>}
      </section>

      <Field label="Ghi chú" htmlFor="note">
        <textarea
          id="note"
          name="note"
          className={`${INPUT_CLASS} min-h-28 resize-y`}
          maxLength={5000}
          defaultValue={property.note ?? ""}
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
