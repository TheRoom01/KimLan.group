"use client";

import { ChangeEvent, DragEvent, FormEvent, useState } from "react";
import { GripVertical, ImagePlus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { readApiResponse } from "@/lib/api/client";
import { generatePropertyCode } from "@/lib/owner/propertyCode";

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
  default_room_data?: Record<string, any> | null;
  note?: string | null;
  approval_status?: string | null;
};

const INPUT_CLASS =
  "w-full rounded-xl border border-[#aa825d]/35 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#744722] focus:ring-2 focus:ring-[#aa825d]/20";

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
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [activeTab, setActiveTab] = useState<"info" | "amenities" | "fees">("info");
  const defaults = property.default_room_data ?? {};

  async function uploadFile(file: File, propertyId: string) {
    const presignResponse = await fetch("/api/upload/r2-presign", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_id: propertyId, file_name: file.name, content_type: file.type, size: file.size }),
    });
    const presign = await presignResponse.json().catch(() => null) as { uploadUrl?: string; publicUrl?: string; requiredHeaders?: Record<string, string>; error?: string } | null;
    if (!presignResponse.ok || !presign?.uploadUrl || !presign.publicUrl) throw new Error(presign?.error || "Không thể chuẩn bị upload media tòa nhà.");
    const response = await fetch(presign.uploadUrl, { method: "PUT", headers: presign.requiredHeaders, body: file });
    if (!response.ok) throw new Error(`Upload ${file.name} thất bại.`);
    return presign.publicUrl;
  }

  async function uploadImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!property.id) {
        setPendingFiles((current) => [...current, ...files]);
        setGallery((current) => [...current, ...files.map((file) => URL.createObjectURL(file))].slice(0, 20));
        return;
      }
      const uploaded: string[] = [];
      for (const file of files) {
        const isVideo = file.type.startsWith("video/");
        if ((!file.type.startsWith("image/") && !isVideo) || file.size > (isVideo ? 50 : 10) * 1024 * 1024) {
          throw new Error("Ảnh tối đa 10 MB, video tối đa 50 MB.");
        }
        uploaded.push(await uploadFile(file, property.id));
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
    if (!property.id) {
      setPendingFiles((current) => {
        const next = [...current];
        const [moved] = next.splice(draggedIndex, 1);
        next.splice(targetIndex, 0, moved);
        return next;
      });
    }
    setDraggedIndex(null);
  }

  function removeMedia(index: number) {
    setGallery((current) => current.filter((_, itemIndex) => itemIndex !== index));
    if (!property.id) setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    try {
      const payload = {
          code: generatePropertyCode({
            houseNumber: form.get("house_number"),
            address: form.get("address"),
            district: form.get("district"),
          }),
          house_number: form.get("house_number"),
          address: form.get("address"),
          ward: form.get("ward"),
          district: form.get("district"),
          city: form.get("city"),
          cover_image: gallery[0] ?? null,
          gallery_images: gallery,
          google_maps_url: form.get("google_maps_url"),
          default_room_data: buildDefaultRoomData(form),
          note: form.get("note"),
      };
      if (!property.id) {
        const created = await readApiResponse<{ mode: string; property_id?: string }>(await fetch("/api/owner/properties", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        }));
        if (created.mode === "owner_recovered" && created.property_id) {
          router.push(`/owner/properties/${created.property_id}/edit`);
          router.refresh();
          return;
        }
        if (created.mode === "verification_pending") {
          setError("Tòa nhà đã tồn tại và SĐT chưa khớp chủ hiện tại. Yêu cầu xác minh đã được tạo cho chủ cũ và Admin L1.");
          return;
        }
        if (created.mode !== "created" || !created.property_id) throw new Error("Không thể xác định kết quả tạo tòa nhà.");
        const uploaded = await Promise.all(pendingFiles.map((file) => uploadFile(file, created.property_id!)));
        const finalPayload = { ...payload, gallery_images: uploaded, cover_image: uploaded[0] ?? null };
        await readApiResponse(await fetch(`/api/owner/properties/${created.property_id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(finalPayload) }));
        router.push(`/owner/properties/${created.property_id}`);
        router.refresh();
        return;
      }
      const response = await fetch(`/api/owner/properties/${property.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
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
      className="space-y-6 rounded-2xl border border-[#aa825d]/25 bg-[#fff9ef] p-6 shadow-sm"
    >
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[#f3e1c9] p-1">
        {([['info', 'Thông tin'], ['amenities', 'Tiện nghi'], ['fees', 'Chi phí']] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setActiveTab(key)} className={`rounded-xl px-2 py-2.5 text-sm font-bold ${activeTab === key ? 'bg-[#744722] text-white' : 'text-[#684324]'}`}>{label}</button>)}
      </div>

      <div className={`${activeTab === "info" ? "grid" : "hidden"} gap-5 md:grid-cols-2`}>
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
        <Field label="Trạng thái mặc định" htmlFor="room_status"><select id="room_status" name="room_status" className={INPUT_CLASS} defaultValue={defaults.status ?? "Đang trống"}><option>Đang trống</option><option>Sắp trống</option><option>Đã thuê</option></select></Field>
        <Field label="Số điện thoại Zalo" htmlFor="zalo_phone"><textarea id="zalo_phone" name="zalo_phone" className={INPUT_CLASS} defaultValue={defaults.zalo_phone ?? ""} /></Field>
        <Field label="Link Zalo" htmlFor="link_zalo"><input id="link_zalo" name="link_zalo" className={INPUT_CLASS} defaultValue={defaults.link_zalo ?? ""} /></Field>
        <Field label="Mô tả mặc định" htmlFor="description"><textarea id="description" name="description" className={INPUT_CLASS} defaultValue={defaults.description ?? ""} /></Field>
        <Field label="Chính sách mặc định" htmlFor="chinh_sach"><textarea id="chinh_sach" name="chinh_sach" className={INPUT_CLASS} defaultValue={defaults.chinh_sach ?? ""} /></Field>

      </div>

      <div className={activeTab === "amenities" ? "grid grid-cols-2 gap-2 lg:grid-cols-4" : "hidden"}>
  {AMENITIES.map(([name, label]) => <label key={name} className="flex items-center gap-2 rounded-xl border border-[#aa825d]/35 bg-[#fff9ef] px-3 py-2.5 text-sm font-semibold"><input type="checkbox" name={name} defaultChecked={Boolean(defaults.room_details?.[name])} className="h-4 w-4 accent-[#744722]" />{label}</label>)}
  <div className="col-span-2 lg:col-span-4"><Field label="Tiện nghi khác" htmlFor="other_amenities"><textarea id="other_amenities" name="other_amenities" className={INPUT_CLASS} defaultValue={defaults.room_details?.other_amenities ?? ""} /></Field></div>
</div>

      <div className={activeTab === "fees" ? "grid gap-4 sm:grid-cols-2" : "hidden"}>
        {FEES.map(([name, label, defaultUnit]) => <div key={name} className="grid grid-cols-[minmax(0,1fr)_minmax(110px,140px)] gap-2"><Field label={label} htmlFor={`${name}_value`}><input id={`${name}_value`} name={`${name}_value`} type="number" className={INPUT_CLASS} defaultValue={defaults.room_details?.[`${name}_value`] ?? ""} /></Field><Field label="Đơn vị" htmlFor={`${name}_unit`}><input id={`${name}_unit`} name={`${name}_unit`} className={INPUT_CLASS} defaultValue={defaults.room_details?.[`${name}_unit`] || defaultUnit} /></Field></div>)}
        <Field label="Phí khác" htmlFor="other_fee_value"><input id="other_fee_value" name="other_fee_value" type="number" className={INPUT_CLASS} defaultValue={defaults.room_details?.other_fee_value ?? ""} /></Field>
        <Field label="Ghi chú phí khác" htmlFor="other_fee_note"><input id="other_fee_note" name="other_fee_note" className={INPUT_CLASS} defaultValue={defaults.room_details?.other_fee_note ?? ""} /></Field>
      </div>

      {activeTab === "info" ? <section className="space-y-3 rounded-2xl border border-[#aa825d]/25 bg-[#fff9ef] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-bold text-[#4d3422]">Hình ảnh tòa nhà</h2><p className="text-xs text-[#80634a]">Ảnh đầu tiên là ảnh đại diện. Kéo thả để đổi thứ tự.</p></div>
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-[#744722] px-4 text-sm font-bold text-white">
              <ImagePlus size={17} /> Thêm ảnh
              <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={uploadImages} />
            </label>
          </div>

          {gallery.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {gallery.map((url, index) => <article key={`${url}-${index}`} draggable onDragStart={() => setDraggedIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropImage(event, index)} className="overflow-hidden rounded-xl border bg-white">
              {isVideoUrl(url) ? <video src={url} controls className="h-28 w-full bg-black object-cover" /> : <img src={url} alt={`Ảnh tòa nhà ${index + 1}`} className="h-28 w-full object-cover" />}
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="flex items-center gap-1 text-[11px] font-semibold">
                  <GripVertical size={13} />
                  {index === 0 ? "Media đại diện" : `Media ${index + 1}`}
                </span>
                <button type="button" onClick={() => removeMedia(index)} className="text-red-700" aria-label="Xóa media">
                  <Trash2 size={15} />
                </button>
              </div>
            </article>)}
          </div> : <div className="rounded-xl border border-dashed p-6 text-center text-sm text-[#80634a]">Chưa có ảnh tòa nhà.</div>}
        </section> : null}

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
    <div className="space-y-1.5 rounded-xl border border-[#aa825d]/25 bg-[#fff9ef] p-3">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-800">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

const AMENITIES = [
  ["has_elevator", "Thang máy"], ["has_stairs", "Cầu thang bộ"],
  ["shared_washer", "Máy giặt chung"], ["private_washer", "Máy giặt riêng"],
  ["shared_dryer", "Máy sấy chung"], ["private_dryer", "Máy sấy riêng"],
  ["has_parking", "Chỗ để xe"], ["has_basement", "Hầm xe"],
  ["fingerprint_lock", "Khóa vân tay"],["free_time", "Giờ giấc tự do"], ["allow_pet", "Cho nuôi thú cưng"],
  ["allow_cat", "Cho nuôi mèo"], ["allow_dog", "Cho nuôi chó"],
  ["no_pet", "Không thú cưng"], ["short_term", "Thuê ngắn hạn"], ["long_term", "Thuê dài hạn"],
] as const;

const FEES = [
  ["electric_fee", "Tiền điện", "kWh"],
  ["water_fee", "Tiền nước", "người/tháng"],
  ["service_fee", "Phí dịch vụ", "phòng/tháng"],
  ["parking_fee", "Phí gửi xe", "chiếc/tháng"],
] as const;

function buildDefaultRoomData(form: FormData) {
  const roomDetails: Record<string, unknown> = {};
  for (const [name] of AMENITIES) roomDetails[name] = form.get(name) === "on";
  for (const [name] of FEES) {
    roomDetails[`${name}_value`] = form.get(`${name}_value`) || null;
    roomDetails[`${name}_unit`] = form.get(`${name}_unit`) || null;
  }
  roomDetails.other_fee_value = form.get("other_fee_value") || null;
  roomDetails.other_fee_note = form.get("other_fee_note") || null;
  roomDetails.other_amenities = form.get("other_amenities") || null;
  return {
    status: form.get("room_status") || "Đang trống",
    description: form.get("description") || null,
    chinh_sach: form.get("chinh_sach") || null,
    link_zalo: form.get("link_zalo") || null,
    zalo_phone: form.get("zalo_phone") || null,
    room_details: roomDetails,
  };
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v)(?:$|\?)/i.test(url) || url.includes("/video/");
}
