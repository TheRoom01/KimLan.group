"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import PendingRoomMediaPreview from "@/components/owner/PendingRoomMediaPreview";
import RoomTypePicker from "@/components/owner/RoomTypePicker";
import MoneyInput from "@/components/owner/MoneyInput";

import { readApiResponse } from "@/lib/api/client";
import { formatZaloPhones } from "@/lib/owner/formatZaloPhones";
import { isUploadImage, isUploadVideo, prepareImagesForUpload } from "@/lib/media/uploadFileType";
import {
  uploadRoomMediaFiles,
  validateRoomMediaFiles,
  type RoomMediaUploadProgress,
} from "@/lib/owner/uploadRoomMedia";

type CreateRoomResult = {
  mode?: "created" | "existing";

  room_id?: string;

  message?: string;

  room?: {
    id?: string;
  };

  details_saved?: boolean;
};

type CopiedMedia = {
  id?: string;
  type?: "image" | "video";
  url?: string;
  is_cover?: boolean;
  sort_order?: number;
};

const INPUT_CLASS =
  "w-full rounded-xl border border-[#aa825d]/35 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#744722] focus:ring-2 focus:ring-[#aa825d]/20";

export default function CreateRoomForm({
  propertyId,
  defaults = {},
  copySourceRoomId,
}: {
  propertyId: string;
  // Property defaults are stored in legacy JSON with mixed value types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaults?: Record<string, any>;
  copySourceRoomId?: string;
}) {
  const detailDefaults = defaults.room_details ?? {};
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [copiedMedia, setCopiedMedia] = useState<CopiedMedia[]>(
    copySourceRoomId && Array.isArray(defaults.media) ? defaults.media : [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<RoomMediaUploadProgress | null>(null);
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "amenities" | "fees">("info");

  const fileSummary = useMemo(() => {
    const images = files.filter(isUploadImage).length;
    const videos = files.filter(isUploadVideo).length;
    return `${images} ảnh, ${videos} video`;
  }, [files]);

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    setError(null);

    try {
      const prepared = await prepareImagesForUpload(selected);
      validateRoomMediaFiles(prepared);
      setFiles(prepared);
    } catch (validationError) {
      setFiles([]);
      setError(validationError instanceof Error ? validationError.message : "Media không hợp lệ");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setCreatedRoomId(null);
    setUploadStatus(null);

    const form = new FormData(event.currentTarget);
    const noPet = form.get("no_pet") === "on";
    const allowPet = form.get("allow_pet") === "on" && !noPet;

    const roomDetails = {
      electric_fee_value: form.get("electric_fee_value"),
      electric_fee_unit: form.get("electric_fee_unit"),
      water_fee_value: form.get("water_fee_value"),
      water_fee_unit: form.get("water_fee_unit"),
      service_fee_value: form.get("service_fee_value"),
      service_fee_unit: form.get("service_fee_unit"),
      parking_fee_value: form.get("parking_fee_value"),
      parking_fee_unit: form.get("parking_fee_unit"),
      other_fee_value: form.get("other_fee_value"),
      other_fee_note: form.get("other_fee_note"),
      has_elevator: form.get("has_elevator") === "on",
      has_stairs: form.get("has_stairs") === "on",
      shared_washer: form.get("shared_washer") === "on",
      private_washer: form.get("private_washer") === "on",
      shared_dryer: form.get("shared_dryer") === "on",
      private_dryer: form.get("private_dryer") === "on",
      has_parking: form.get("has_parking") === "on",
      has_basement: form.get("has_basement") === "on",
      fingerprint_lock: form.get("fingerprint_lock") === "on",
      free_time: form.get("free_time") === "on",
      allow_pet: allowPet,
      allow_cat: allowPet && form.get("allow_cat") === "on",
      allow_dog: allowPet && form.get("allow_dog") === "on",
      no_pet: !allowPet,
      short_term: form.get("short_term") === "on",
      long_term: form.get("long_term") === "on",
      other_amenities: form.get("other_amenities"),
      detail_json: {},
    };

    const payload = {
      room_code: form.get("room_code"),
      status: form.get("status"),
      room_type: form.get("room_type"),
      price: form.get("price"),
      description: form.get("description"),
      chinh_sach: form.get("chinh_sach"),
      link_zalo: form.get("link_zalo"),
      zalo_phone: form.get("zalo_phone"),
      google_maps_url: form.get("google_maps_url"),
      house_number: form.get("house_number"),
      address: form.get("address"),
      ward: form.get("ward"),
      district: form.get("district"),
      room_details: roomDetails,
    };

    try {
      const createResponse = await fetch(
        `/api/owner/properties/${propertyId}/rooms`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      const createResult =
        await readApiResponse<CreateRoomResult>(
          createResponse,
        );


      const roomId =
        createResult.room_id ??
        createResult.room?.id;


      if (!roomId) {
        throw new Error(
          "API không trả về mã phòng",
        );
      }
     
      setCreatedRoomId(roomId);

      if (copySourceRoomId) {
        const response = await fetch(`/api/owner/rooms/${roomId}/clone-media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_room_id: copySourceRoomId,
            media_ids: copiedMedia.map((item) => item.id).filter(Boolean),
          }),
        });
        await readApiResponse(response);
      }

      if (files.length > 0) {
        await uploadRoomMediaFiles({
          roomId,
          files,
          startSortOrder: copiedMedia.length,
          coverAlreadyExists: copiedMedia.some((item) => item.type === "image"),
          onProgress: setUploadStatus,
        });
      }

      /**
       * Chỉ công khai phòng sau khi toàn bộ media đã upload
       * và metadata đã được lưu thành công.
       *
       * Trường hợp không chọn media, phòng vẫn được publish
       * ngay sau bước tạo bản ghi.
       */
      const publishResponse = await fetch(
        `/api/owner/rooms/${roomId}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: payload.status }),
        },
      );

      await readApiResponse<unknown>(publishResponse);

      router.push(`/owner/rooms/${roomId}`);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Không thể tạo phòng",
      );
    } finally {
      setSubmitting(false);
      setUploadStatus(null);
    }
  }

  return (
    <form
      id="create-room-form"
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-[#aa825d]/25 bg-[#fff9ef] p-4 shadow-sm sm:p-6"
    >
      <RoomTabs activeTab={activeTab} onChange={setActiveTab} />
      <Section title="Thông tin phòng" active={activeTab === "info"}>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Mã phòng" htmlFor="room_code" required>
            <input
              id="room_code"
              name="room_code"
              className={INPUT_CLASS}
              maxLength={100}
              required
              placeholder="P.101"
              defaultValue={defaults.room_code ?? ""}
            />
          </Field>

          <Field label="Loại phòng" htmlFor="room_type">
            <RoomTypePicker initialValue={defaults.room_type ?? ""} />
          </Field>

          <Field label="Giá thuê tháng" htmlFor="price">
            <MoneyInput
              id="price"
              name="price"
              className={INPUT_CLASS}
              placeholder="4500000"
              defaultValue={defaults.price}
            />
          </Field>

          <Field label="Trạng thái phòng" htmlFor="status"><select id="status" name="status" className={INPUT_CLASS} defaultValue={defaults.status ?? "Đang trống"}><option>Đang trống</option><option>Sắp trống</option><option>Đã thuê</option></select></Field>
          <Field label="Số nhà" htmlFor="house_number"><input id="house_number" name="house_number" className={INPUT_CLASS} placeholder="Ví dụ: 177/10/11" defaultValue={defaults.house_number ?? ""} /></Field>
          <Field label="Địa chỉ" htmlFor="address"><input id="address" name="address" className={INPUT_CLASS} placeholder="Nhập tên đường hoặc địa chỉ" defaultValue={defaults.address ?? ""} /></Field>
          <Field label="Phường" htmlFor="ward"><input id="ward" name="ward" className={INPUT_CLASS} placeholder="Nhập phường / xã" defaultValue={defaults.ward ?? ""} /></Field>
          <Field label="Quận / khu vực" htmlFor="district"><input id="district" name="district" className={INPUT_CLASS} placeholder="Nhập quận / huyện" defaultValue={defaults.district ?? ""} /></Field>

          <Field label="Số điện thoại Zalo" htmlFor="zalo_phone">
            <textarea
              id="zalo_phone"
              name="zalo_phone"
              className={`${INPUT_CLASS} min-h-24 resize-y`}
              maxLength={300}
              placeholder="Nhập số điện thoại Zalo"
              defaultValue={formatZaloPhones(defaults.zalo_phone)}
            />
          </Field>

          <Field label="Link Zalo" htmlFor="link_zalo">
            <input
              id="link_zalo"
              name="link_zalo"
              type="url"
              className={INPUT_CLASS}
              maxLength={2000}
              placeholder="https://zalo.me/..."
              defaultValue={defaults.link_zalo ?? ""}
            />
          </Field>

          <div className="md:col-span-2">
            <Field label="Link Google Maps" htmlFor="google_maps_url" hint="Tự động kế thừa từ tòa nhà.">
              <input id="google_maps_url" name="google_maps_url" type="url" className={`${INPUT_CLASS} bg-[#f5eee5]`} maxLength={2000} readOnly defaultValue={defaults.google_maps_url ?? ""} />
            </Field>
          </div>

          <div className="md:col-span-2">
            <Field label="Mô tả" htmlFor="description">
              <textarea
                id="description"
                name="description"
                className={`${INPUT_CLASS} min-h-28 resize-y`}
                maxLength={5000}
                placeholder="Nhập nội dung mô tả"
                defaultValue={defaults.description ?? ""}
              />
            </Field>
          </div>

          <div className="md:col-span-2">
            <Field label="Chính sách phòng" htmlFor="chinh_sach">
              <textarea
                id="chinh_sach"
                name="chinh_sach"
                className={`${INPUT_CLASS} min-h-24 resize-y`}
                maxLength={5000}
                placeholder="Nhập chính sách áp dụng"
                defaultValue={defaults.chinh_sach ?? ""}
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Chi phí dịch vụ" active={activeTab === "fees"}>
        <div className="grid gap-5 md:grid-cols-2">
          <FeeField
            label="Tiền điện"
            valueName="electric_fee_value"
            unitName="electric_fee_unit"
            defaultUnit="đ/kWh"
            defaultValue={detailDefaults.electric_fee_value}
            defaultUnitValue={detailDefaults.electric_fee_unit}
          />
          <FeeField
            label="Tiền nước"
            valueName="water_fee_value"
            unitName="water_fee_unit"
            defaultUnit="đ/người/tháng"
            defaultValue={detailDefaults.water_fee_value}
            defaultUnitValue={detailDefaults.water_fee_unit}
          />
          <FeeField
            label="Phí dịch vụ"
            valueName="service_fee_value"
            unitName="service_fee_unit"
            defaultUnit="đ/phòng/tháng"
            defaultValue={detailDefaults.service_fee_value}
            defaultUnitValue={detailDefaults.service_fee_unit}
          />
          <FeeField
            label="Phí giữ xe"
            valueName="parking_fee_value"
            unitName="parking_fee_unit"
            defaultUnit="đ/xe/tháng"
            defaultValue={detailDefaults.parking_fee_value}
            defaultUnitValue={detailDefaults.parking_fee_unit}
          />
          <FeeField
            label="Phí khác"
            valueName="other_fee_value"
            unitName="other_fee_note"
            defaultUnit="Ghi chú khoản phí"
            defaultValue={detailDefaults.other_fee_value}
            defaultUnitValue={detailDefaults.other_fee_note}
          />
        </div>
      </Section>

      <Section title="Tiện nghi và chính sách thuê" active={activeTab === "amenities"}>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Checkbox name="free_time" label="Giờ giấc tự do" defaultChecked={Boolean(detailDefaults.free_time)} />
          <Checkbox name="has_elevator" label="Thang máy" defaultChecked={Boolean(detailDefaults.has_elevator)} />
          <Checkbox name="has_stairs" label="Cầu thang bộ" defaultChecked={Boolean(detailDefaults.has_stairs)} />
          <Checkbox name="has_parking" label="Chỗ để xe" defaultChecked={Boolean(detailDefaults.has_parking)} />
          <Checkbox name="has_basement" label="Hầm xe" defaultChecked={Boolean(detailDefaults.has_basement)} />
          <Checkbox name="fingerprint_lock" label="Khóa vân tay" defaultChecked={Boolean(detailDefaults.fingerprint_lock)} />
          <Checkbox name="shared_washer" label="Máy giặt chung" defaultChecked={Boolean(detailDefaults.shared_washer)} />
          <Checkbox name="private_washer" label="Máy giặt riêng" defaultChecked={Boolean(detailDefaults.private_washer)} />
          <Checkbox name="shared_dryer" label="Máy sấy chung" defaultChecked={Boolean(detailDefaults.shared_dryer)} />
          <Checkbox name="private_dryer" label="Máy sấy riêng" defaultChecked={Boolean(detailDefaults.private_dryer)} />
          <Checkbox name="short_term" label="Cho thuê ngắn hạn" defaultChecked={Boolean(detailDefaults.short_term)} />
          <Checkbox name="long_term" label="Cho thuê dài hạn" defaultChecked={detailDefaults.long_term !== false} />
          <Checkbox name="allow_pet" label="Cho phép thú cưng" defaultChecked={Boolean(detailDefaults.allow_pet)} />
          <Checkbox name="no_pet" label="Không nhận thú cưng" defaultChecked={Boolean(detailDefaults.no_pet)} />
          <Checkbox name="allow_cat" label="Cho phép mèo" defaultChecked={Boolean(detailDefaults.allow_cat)} />
          <Checkbox name="allow_dog" label="Cho phép chó" defaultChecked={Boolean(detailDefaults.allow_dog)} />
        </div>

        <div className="mt-5 grid gap-5">
          <div className="col-span-2 lg:col-span-4">
            <Field label="Tiện nghi khác" htmlFor="other_amenities">
              <textarea
                id="other_amenities"
                name="other_amenities"
                className={`${INPUT_CLASS} min-h-20 resize-y`}
                maxLength={2000}
                placeholder="Ban công, cửa sổ, máy lạnh..."
                defaultValue={detailDefaults.other_amenities ?? ""}
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Media" active={activeTab === "info"}>
        {copySourceRoomId && copiedMedia.length ? (
          <div className="mb-4">
            <p className="mb-3 rounded-xl border border-[#aa825d]/25 bg-[#f8ead7] p-3 text-sm text-[#684324]">
              Đang dùng chung {copiedMedia.length} ảnh/video từ phòng nguồn. Bạn có thể bỏ từng media trước khi tạo phòng.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {copiedMedia.map((item, index) => (
                <article key={item.id ?? `${item.url}-${index}`} className="relative overflow-hidden rounded-xl border border-[#aa825d]/30 bg-white">
                  {item.type === "video" ? <video src={item.url} controls className="h-32 w-full object-cover" /> : <img src={item.url} alt={`Media copy ${index + 1}`} className="h-32 w-full object-cover" />}
                  <button type="button" disabled={submitting} onClick={() => setCopiedMedia((current) => current.filter((_, mediaIndex) => mediaIndex !== index))} className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-red-700 shadow" aria-label="Bỏ media khỏi phòng mới"><Trash2 size={15} /></button>
                </article>
              ))}
            </div>
          </div>
        ) : null}
        <Field
          label="Thêm ảnh/video"
          htmlFor="media_files"
          hint="Tối đa 20 file. Ảnh tối đa 15 MB; video tối đa 50 MB. Ảnh đầu tiên sẽ làm ảnh đại diện."
        >
          <input
            id="media_files"
            type="file"
            accept="image/*,.heic,.heif,video/*"
            multiple
            onChange={handleFiles}
            disabled={submitting}
            className="block w-full rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-[#744722] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
          />
        </Field>

        {files.length > 0 ? (
          <div className="hidden">
            <p className="font-medium">Đã chọn: {fileSummary}</p>
            <ul className="mt-2 max-h-36 space-y-1 overflow-auto text-gray-600">
              {files.map((file) => (
                <li key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between gap-3 rounded-lg border border-[#aa825d]/20 bg-white px-3 py-2">
                  <span className="min-w-0 truncate">{file.name} — {formatBytes(file.size)}</span>
                  <button type="button" onClick={() => setFiles((current) => current.filter((candidate) => candidate !== file))} className="shrink-0 text-red-700" aria-label={`Xóa ${file.name}`}><Trash2 size={16} /></button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <PendingRoomMediaPreview files={files} setFiles={setFiles} disabled={submitting} />
      </Section>

      {uploadStatus ? (
        <div className="rounded-lg border bg-white p-4 text-sm">
          Đang tải file {uploadStatus.current}/{uploadStatus.total}: {uploadStatus.fileName}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <p>{error}</p>
          {createdRoomId ? (
            <p className="mt-2">
              Bản ghi phòng đã được tạo nhưng chưa được xuất bản công khai vì quy
              trình lưu media chưa hoàn tất. Những file tải thành công trước thời
              điểm lỗi vẫn được giữ lại.{" "}
              <Link
                className="font-semibold underline"
                href={`/owner/rooms/${createdRoomId}`}
              >
                Mở phòng để kiểm tra
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={submitting}
          className="rounded-xl border border-[#9d744f]/30 bg-white px-4 py-2 text-sm font-medium text-[#684324] hover:bg-[#f8ead7] disabled:opacity-50"
        >
          Hủy
        </button>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-[#744722] px-5 py-2 text-sm font-bold text-white hover:bg-[#633b1d] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Đang tạo và xuất bản..." : "Tạo và xuất bản phòng"}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
  active = true,
}: {
  title: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <section className={active ? "block" : "hidden"}>
      <h2 className="sr-only">{title}</h2>
      {children}
    </section>
  );
}

function RoomTabs({ activeTab, onChange }: { activeTab: "info" | "amenities" | "fees"; onChange: (tab: "info" | "amenities" | "fees") => void }) {
  const options = [['info', 'Thông tin'], ['amenities', 'Tiện nghi'], ['fees', 'Chi phí']] as const;
  return <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[#f3e1c9] p-1">{options.map(([key, label]) => <button key={key} type="button" onClick={() => onChange(key)} className={`rounded-xl px-2 py-2.5 text-sm font-bold transition ${activeTab === key ? 'bg-[#744722] text-white shadow-sm' : 'text-[#684324] hover:bg-[#ead2b2]'}`}>{label}</button>)}</div>;
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
    <div className="space-y-1.5 rounded-xl border border-[#aa825d]/25 bg-white p-3">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-800">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

function FeeField({
  label,
  valueName,
  unitName,
  defaultUnit,
  defaultValue,
  defaultUnitValue,
}: {
  label: string;
  valueName: string;
  unitName: string;
  defaultUnit: string;
  defaultValue?: unknown;
  defaultUnitValue?: unknown;
}) {
  return (
    <div className="space-y-1.5 rounded-xl border border-[#aa825d]/25 bg-white p-3">
      <label htmlFor={valueName} className="block text-sm font-medium text-gray-800">
        {label}
      </label>
      <div className="grid grid-cols-2 gap-2">
        <MoneyInput
          id={valueName}
          name={valueName}
          className={INPUT_CLASS}
          placeholder="Số tiền"
          defaultValue={defaultValue}
        />
        <input
          name={unitName}
          className={INPUT_CLASS}
          maxLength={2000}
          placeholder={defaultUnit}
          defaultValue={String(defaultUnitValue ?? "")}
        />
      </div>
    </div>
  );
}

function Checkbox({
  name,
  label,
  defaultChecked = false,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-[#aa825d]/35 bg-[#fff9ef] px-3 py-2.5 text-sm font-semibold text-gray-800">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-gray-300 accent-[#744722]"
      />
      {label}
    </label>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
