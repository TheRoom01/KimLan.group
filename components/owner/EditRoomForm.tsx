"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import PendingRoomMediaPreview from "@/components/owner/PendingRoomMediaPreview";

import { readApiResponse } from "@/lib/api/client";
import { formatZaloPhones } from "@/lib/owner/formatZaloPhones";
import {
  uploadRoomMediaFiles,
  validateRoomMediaFiles,
  type RoomMediaUploadProgress,
} from "@/lib/owner/uploadRoomMedia";

type RoomMedia = {
  id?: string;
  type?: "image" | "video";
  url?: string;
  is_cover?: boolean;
  sort_order?: number;
};

type EditableRoom = {
  id: string;
  room_code?: string | null;
  room_type?: string | null;
  price?: number | null;
  description?: string | null;
  chinh_sach?: string | null;
  link_zalo?: string | null;
  zalo_phone?: string | null;
  publish_status?: string | null;
  status?: string | null;
  house_number?: string | null;
  address?: string | null;
  ward?: string | null;
  district?: string | null;
  property_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  details?: Record<string, any> | null;
  media?: RoomMedia[];
};

const INPUT_CLASS =
  "w-full rounded-xl border border-[#aa825d]/35 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#744722] focus:ring-2 focus:ring-[#aa825d]/20";

export default function EditRoomForm({ room }: { room: EditableRoom }) {
  const router = useRouter();
  const details = room.details ?? {};
  const [currentMedia, setCurrentMedia] = useState<RoomMedia[]>(room.media ?? []);
  const [draggedMediaIndex, setDraggedMediaIndex] = useState<number | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] =
    useState<RoomMediaUploadProgress | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "amenities" | "fees">("info");

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    setErrorMessage(null);

    try {
      validateRoomMediaFiles(selected);
      setFiles(selected);
    } catch (error) {
      setFiles([]);
      event.target.value = "";
      setErrorMessage(
        error instanceof Error ? error.message : "Danh sách media không hợp lệ",
      );
    }
  }

  async function deleteExistingMedia(media: RoomMedia) {
    if (!media.id || !window.confirm("Xóa ảnh/video này khỏi phòng?")) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      await readApiResponse(await fetch(`/api/owner/rooms/${room.id}/media/${media.id}`, { method: "DELETE" }));
      setCurrentMedia((items) => items.filter((item) => item.id !== media.id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không thể xóa media");
    } finally {
      setLoading(false);
    }
  }

  function reorderExistingMedia(targetIndex:number){
    if(draggedMediaIndex===null||draggedMediaIndex===targetIndex)return;
    setCurrentMedia(items=>{const next=[...items];const[moved]=next.splice(draggedMediaIndex,1);next.splice(targetIndex,0,moved);return next});
    setDraggedMediaIndex(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setUploadStatus(null);

    const form = new FormData(event.currentTarget);
    const noPet = form.get("no_pet") === "on";
    const allowPet = form.get("allow_pet") === "on" && !noPet;

    const payload = {
      room_code: form.get("room_code"),
      room_type: form.get("room_type"),
      price: form.get("price"),
      description: form.get("description"),
      chinh_sach: form.get("chinh_sach"),
      link_zalo: form.get("link_zalo"),
      zalo_phone: form.get("zalo_phone"),
      publish_status: form.get("publish_status"),
      status: form.get("status"),
      house_number: form.get("house_number"),
      address: form.get("address"),
      ward: form.get("ward"),
      district: form.get("district"),
      room_details: {
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
        allow_pet: allowPet,
        allow_cat: allowPet && form.get("allow_cat") === "on",
        allow_dog: allowPet && form.get("allow_dog") === "on",
        no_pet: !allowPet,
        short_term: form.get("short_term") === "on",
        long_term: form.get("long_term") === "on",
        other_amenities: form.get("other_amenities"),
        detail_json:
          details.detail_json && typeof details.detail_json === "object"
            ? details.detail_json
            : {},
      },
    };

    try {
      const response = await fetch(`/api/owner/rooms/${room.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      await readApiResponse<unknown>(response);

      const orderedMedia=currentMedia.filter((media):media is RoomMedia&{id:string}=>Boolean(media.id));
      if(orderedMedia.length>0){
        await readApiResponse(await fetch(`/api/owner/rooms/${room.id}/media`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:orderedMedia.map((media,index)=>({id:media.id,sort_order:index})),cover_id:orderedMedia.find(media=>media.type==="image")?.id??null})}));
      }

      await readApiResponse(await fetch(`/api/owner/rooms/${room.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: payload.status }),
      }));

      if (files.length > 0) {
        await uploadRoomMediaFiles({
          roomId: room.id,
          files,
          startSortOrder: currentMedia.length,
          coverAlreadyExists: currentMedia.some(
            (media) => media.type === "image" && media.is_cover === true,
          ),
          onProgress: setUploadStatus,
        });
      }

      router.push(`/owner/rooms/${room.id}`);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Cập nhật phòng thất bại",
      );
    } finally {
      setLoading(false);
      setUploadStatus(null);
    }
  }

  return (
    <form id="edit-room-form" onSubmit={submit} className="space-y-6">
      <RoomTabs activeTab={activeTab} onChange={setActiveTab} />
      <Section title="Thông tin phòng" active={activeTab === "info"}>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Mã phòng" htmlFor="room_code" required>
            <input
              id="room_code"
              name="room_code"
              className={INPUT_CLASS}
              maxLength={100}
              defaultValue={room.room_code ?? ""}
              required
            />
          </Field>

          <Field label="Loại phòng" htmlFor="room_type">
            <input
              id="room_type"
              name="room_type"
              className={INPUT_CLASS}
              maxLength={120}
              defaultValue={room.room_type ?? ""}
            />
          </Field>

          <Field label="Giá phòng" htmlFor="price">
            <input
              id="price"
              name="price"
              type="number"
              min={0}
              step={1}
              className={INPUT_CLASS}
              defaultValue={room.price ?? ""}
            />
          </Field>

          <Field
              label="Trạng thái hiển thị"
              htmlFor="publish_status"
              hint="Phòng Xuất bản sẽ hiển thị công khai. Chọn Ẩn để tạm ngừng hiển thị."
            >
              <select
                id="publish_status"
                name="publish_status"
                className={INPUT_CLASS}
                defaultValue={room.publish_status ?? "published"}
              >
                <option value="draft">Lưu nội bộ</option>
                <option value="published">Xuất bản công khai</option>
                <option value="hidden">Ẩn khỏi trang công khai</option>
              </select>
          </Field>

          <Field label="Trạng thái phòng" htmlFor="status"><select id="status" name="status" className={INPUT_CLASS} defaultValue={room.status ?? "Đang trống"}><option>Đang trống</option><option>Sắp trống</option><option>Đã thuê</option></select></Field>
          <Field label="Số nhà" htmlFor="house_number"><input id="house_number" name="house_number" className={INPUT_CLASS} defaultValue={room.house_number ?? ""} /></Field>
          <Field label="Địa chỉ" htmlFor="address"><input id="address" name="address" className={INPUT_CLASS} defaultValue={room.address ?? ""} /></Field>
          <Field label="Phường" htmlFor="ward"><input id="ward" name="ward" className={INPUT_CLASS} defaultValue={room.ward ?? ""} /></Field>
          <Field label="Quận / khu vực" htmlFor="district"><input id="district" name="district" className={INPUT_CLASS} defaultValue={room.district ?? ""} /></Field>

          <Field label="Số điện thoại Zalo" htmlFor="zalo_phone">
            <textarea
              id="zalo_phone"
              name="zalo_phone"
              className={`${INPUT_CLASS} min-h-24 resize-y`}
              maxLength={300}
              defaultValue={formatZaloPhones(room.zalo_phone)}
            />
          </Field>

          <Field label="Link Zalo" htmlFor="link_zalo">
            <input
              id="link_zalo"
              name="link_zalo"
              type="url"
              className={INPUT_CLASS}
              maxLength={2000}
              defaultValue={room.link_zalo ?? ""}
            />
          </Field>

          <div className="md:col-span-2">
            <Field label="Mô tả" htmlFor="description">
              <textarea
                id="description"
                name="description"
                className={`${INPUT_CLASS} min-h-28 resize-y`}
                maxLength={5000}
                defaultValue={room.description ?? ""}
              />
            </Field>
          </div>

          <div className="md:col-span-2">
            <Field label="Chính sách" htmlFor="chinh_sach">
              <textarea
                id="chinh_sach"
                name="chinh_sach"
                className={`${INPUT_CLASS} min-h-24 resize-y`}
                maxLength={5000}
                defaultValue={room.chinh_sach ?? ""}
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
            value={details.electric_fee_value}
            unit={details.electric_fee_unit}
          />
          <FeeField
            label="Tiền nước"
            valueName="water_fee_value"
            unitName="water_fee_unit"
            value={details.water_fee_value}
            unit={details.water_fee_unit}
          />
          <FeeField
            label="Phí dịch vụ"
            valueName="service_fee_value"
            unitName="service_fee_unit"
            value={details.service_fee_value}
            unit={details.service_fee_unit}
          />
          <FeeField
            label="Phí giữ xe"
            valueName="parking_fee_value"
            unitName="parking_fee_unit"
            value={details.parking_fee_value}
            unit={details.parking_fee_unit}
          />
          <FeeField
            label="Phí khác"
            valueName="other_fee_value"
            unitName="other_fee_note"
            value={details.other_fee_value}
            unit={details.other_fee_note}
          />
        </div>
      </Section>

      <Section title="Tiện nghi và chính sách thuê" active={activeTab === "amenities"}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Checkbox name="has_elevator" label="Thang máy" checked={details.has_elevator} />
          <Checkbox name="has_stairs" label="Cầu thang bộ" checked={details.has_stairs} />
          <Checkbox name="has_parking" label="Chỗ để xe" checked={details.has_parking} />
          <Checkbox name="has_basement" label="Hầm xe" checked={details.has_basement} />
          <Checkbox
            name="fingerprint_lock"
            label="Khóa vân tay"
            checked={details.fingerprint_lock}
          />
          <Checkbox
            name="shared_washer"
            label="Máy giặt chung"
            checked={details.shared_washer}
          />
          <Checkbox
            name="private_washer"
            label="Máy giặt riêng"
            checked={details.private_washer}
          />
          <Checkbox
            name="shared_dryer"
            label="Máy sấy chung"
            checked={details.shared_dryer}
          />
          <Checkbox
            name="private_dryer"
            label="Máy sấy riêng"
            checked={details.private_dryer}
          />
          <Checkbox
            name="short_term"
            label="Cho thuê ngắn hạn"
            checked={details.short_term}
          />
          <Checkbox
            name="long_term"
            label="Cho thuê dài hạn"
            checked={details.long_term ?? true}
          />
          <Checkbox name="allow_pet" label="Cho phép thú cưng" checked={details.allow_pet} />
          <Checkbox name="no_pet" label="Không nhận thú cưng" checked={details.no_pet} />
          <Checkbox name="allow_cat" label="Cho phép mèo" checked={details.allow_cat} />
          <Checkbox name="allow_dog" label="Cho phép chó" checked={details.allow_dog} />
        </div>

        <div className="mt-5 grid gap-5">
          <div className="md:col-span-2">
            <Field label="Tiện nghi khác" htmlFor="other_amenities">
              <textarea
                id="other_amenities"
                name="other_amenities"
                className={`${INPUT_CLASS} min-h-20 resize-y`}
                maxLength={2000}
                defaultValue={details.other_amenities ?? ""}
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Media" active={activeTab === "info"}>
        {currentMedia.length > 0 ? (
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {currentMedia.map((media, index) => (
              <div
                key={media.id ?? `${media.url}-${index}`}
                draggable={!loading}
                onDragStart={()=>setDraggedMediaIndex(index)}
                onDragOver={event=>event.preventDefault()}
                onDrop={()=>reorderExistingMedia(index)}
                className="relative cursor-grab overflow-hidden rounded-lg border bg-gray-50"
              >
                {media.id ? <button type="button" onClick={() => void deleteExistingMedia(media)} disabled={loading} className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-red-700 shadow" aria-label="Xóa media"><Trash2 size={15} /></button> : null}
                {media.type === "video" ? (
                  <video
                    src={media.url}
                    controls
                    preload="metadata"
                    className="h-28 w-full object-cover"
                  />
                ) : (
                  <img
                    src={media.url}
                    alt={`Media phòng ${index + 1}`}
                    className="h-28 w-full object-cover"
                  />
                )}
                <p className="px-2 py-1 text-xs text-gray-500">
                  {media.is_cover ? "Ảnh đại diện" : media.type === "video" ? "Video" : "Ảnh"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-4 text-sm text-gray-500">Phòng chưa có media.</p>
        )}

        <Field
          label="Thêm ảnh/video"
          htmlFor="media_files"
          hint="Media hiện có được giữ nguyên. Ảnh tối đa 15 MB; video tối đa 50 MB."
        >
          <input
            id="media_files"
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleFiles}
            disabled={loading}
            className="block w-full rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
          />
        </Field>

        {files.length > 0 ? (
          <ul className="hidden">{files.map((file) => <li key={`${file.name}-${file.lastModified}`}>{file.name}</li>)}</ul>
        ) : null}
        <PendingRoomMediaPreview files={files} setFiles={setFiles} disabled={loading} />
      </Section>

      {uploadStatus ? (
        <div className="rounded-lg border bg-white p-4 text-sm">
          Đang tải file {uploadStatus.current}/{uploadStatus.total}: {uploadStatus.fileName}
        </div>
      ) : null}

      {errorMessage ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {errorMessage}
        </div>
      ) : null}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={loading}
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Đang lưu..." : "Lưu thay đổi"}
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
    <section className={`${active ? "block" : "hidden"} rounded-2xl border border-[#aa825d]/25 bg-[#fff9ef] p-4 shadow-sm sm:p-6`}>
      <h2 className="mb-5 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function RoomTabs({ activeTab, onChange }: { activeTab: "info" | "amenities" | "fees"; onChange: (tab: "info" | "amenities" | "fees") => void }) {
  return <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[#f3e1c9] p-1">{([['info', 'Thông tin'], ['amenities', 'Tiện nghi'], ['fees', 'Chi phí']] as const).map(([key, label]) => <button key={key} type="button" onClick={() => onChange(key)} className={`rounded-xl px-2 py-2.5 text-sm font-bold ${activeTab === key ? 'bg-[#744722] text-white' : 'text-[#684324]'}`}>{label}</button>)}</div>;
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
  value,
  unit,
}: {
  label: string;
  valueName: string;
  unitName: string;
  value: unknown;
  unit: unknown;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={valueName} className="block text-sm font-medium text-gray-800">
        {label}
      </label>
      <div className="grid grid-cols-2 gap-2">
        <input
          id={valueName}
          name={valueName}
          type="number"
          min={0}
          step="any"
          className={INPUT_CLASS}
          defaultValue={value === null || value === undefined ? "" : String(value)}
          placeholder="Số tiền"
        />
        <input
          name={unitName}
          className={INPUT_CLASS}
          maxLength={2000}
          defaultValue={unit === null || unit === undefined ? "" : String(unit)}
          placeholder="Đơn vị / ghi chú"
        />
      </div>
    </div>
  );
}

function Checkbox({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-800">
      <input
        type="checkbox"
        name={name}
        defaultChecked={Boolean(checked)}
        className="h-4 w-4 rounded border-gray-300"
      />
      {label}
    </label>
  );
}
