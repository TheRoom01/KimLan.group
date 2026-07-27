"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { readApiResponse } from "@/lib/api/client";

type CreateRoomResult = {
  mode?: "created" | "existing";

  room_id?: string;

  message?: string;

  room?: {
    id?: string;
  };

  details_saved?: boolean;
};

type PresignResult = {
  key: string;
  publicUrl: string;
  uploadUrl: string;
  requiredHeaders?: Record<string, string>;
  type: "image" | "video";
};

type UploadStatus = {
  current: number;
  total: number;
  fileName: string;
};

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-600 focus:ring-2 focus:ring-gray-200";
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 20;

export default function CreateRoomForm({
  propertyId,
  propertyName,
}: {
  propertyId: string;
  propertyName?: string | null;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);

  const fileSummary = useMemo(() => {
    const images = files.filter((file) => file.type.startsWith("image/")).length;
    const videos = files.filter((file) => file.type.startsWith("video/")).length;
    return `${images} ảnh, ${videos} video`;
  }, [files]);

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    setError(null);

    if (selected.length > MAX_FILES) {
      setFiles([]);
      setError(`Chỉ được chọn tối đa ${MAX_FILES} file mỗi phòng`);
      event.target.value = "";
      return;
    }

    for (const file of selected) {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");

      if (!isImage && !isVideo) {
        setFiles([]);
        setError(`File ${file.name} không phải ảnh hoặc video`);
        event.target.value = "";
        return;
      }

      if (isVideo && file.size > MAX_VIDEO_BYTES) {
        setFiles([]);
        setError(`Video ${file.name} vượt giới hạn 50 MB`);
        event.target.value = "";
        return;
      }

      if (isImage && file.size > MAX_IMAGE_BYTES) {
        setFiles([]);
        setError(`Ảnh ${file.name} vượt giới hạn 15 MB`);
        event.target.value = "";
        return;
      }
    }

    setFiles(selected);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setCreatedRoomId(null);
    setUploadStatus(null);

    const form = new FormData(event.currentTarget);
    const petPolicy = String(form.get("pet_policy") ?? "no_pet");
    const allowPet = petPolicy === "allowed";

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
      room_type: form.get("room_type"),
      price: form.get("price"),
      description: form.get("description"),
      chinh_sach: form.get("chinh_sach"),
      link_zalo: form.get("link_zalo"),
      zalo_phone: form.get("zalo_phone"),
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
     
     if (createResult.mode === "existing") {

        router.push(
          `/owner/rooms/${roomId}/edit`
        );

        return;
      }

      setCreatedRoomId(roomId);

      let firstImageAssigned = false;

      for (const [index, file] of files.entries()) {
        setUploadStatus({
          current: index + 1,
          total: files.length,
          fileName: file.name,
        });

        const presign = await createPresignedUpload(roomId, file);
        await uploadToR2(file, presign);

        const isCover = presign.type === "image" && !firstImageAssigned;
        if (isCover) firstImageAssigned = true;

        const mediaResponse = await fetch(`/api/owner/rooms/${roomId}/media`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            items: [
              {
                type: presign.type,
                provider: "r2",
                url: presign.publicUrl,
                path: presign.key,
                is_cover: isCover,
                sort_order: index,
              },
            ],
          }),
        });

      await readApiResponse(mediaResponse);
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
    <form onSubmit={handleSubmit} className="space-y-6">
      <Section title="Thông tin phòng">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Mã phòng" htmlFor="room_code" required>
            <input
              id="room_code"
              name="room_code"
              className={INPUT_CLASS}
              maxLength={100}
              required
              placeholder="P.101"
            />
          </Field>

          <Field label="Loại phòng" htmlFor="room_type">
            <input
              id="room_type"
              name="room_type"
              className={INPUT_CLASS}
              maxLength={120}
              placeholder="Studio, 1PN, phòng gác..."
            />
          </Field>

          <Field label="Giá thuê tháng" htmlFor="price">
            <input
              id="price"
              name="price"
              type="number"
              min={0}
              step={1}
              className={INPUT_CLASS}
              placeholder="4500000"
            />
          </Field>

          <Field label="Số điện thoại Zalo" htmlFor="zalo_phone">
            <input
              id="zalo_phone"
              name="zalo_phone"
              className={INPUT_CLASS}
              maxLength={30}
            />
          </Field>

          <div className="md:col-span-2">
            <Field label="Link Zalo" htmlFor="link_zalo">
              <input
                id="link_zalo"
                name="link_zalo"
                type="url"
                className={INPUT_CLASS}
                maxLength={2000}
                placeholder="https://zalo.me/..."
              />
            </Field>
          </div>

          <div className="md:col-span-2">
            <Field label="Mô tả" htmlFor="description">
              <textarea
                id="description"
                name="description"
                className={`${INPUT_CLASS} min-h-28 resize-y`}
                maxLength={5000}
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
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Chi phí dịch vụ">
        <div className="grid gap-5 md:grid-cols-2">
          <FeeField
            label="Tiền điện"
            valueName="electric_fee_value"
            unitName="electric_fee_unit"
            defaultUnit="đ/kWh"
          />
          <FeeField
            label="Tiền nước"
            valueName="water_fee_value"
            unitName="water_fee_unit"
            defaultUnit="đ/người/tháng"
          />
          <FeeField
            label="Phí dịch vụ"
            valueName="service_fee_value"
            unitName="service_fee_unit"
            defaultUnit="đ/phòng/tháng"
          />
          <FeeField
            label="Phí giữ xe"
            valueName="parking_fee_value"
            unitName="parking_fee_unit"
            defaultUnit="đ/xe/tháng"
          />
          <FeeField
            label="Phí khác"
            valueName="other_fee_value"
            unitName="other_fee_note"
            defaultUnit="Ghi chú khoản phí"
          />
        </div>
      </Section>

      <Section title="Tiện nghi và chính sách">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Checkbox name="has_elevator" label="Thang máy" />
          <Checkbox name="has_stairs" label="Cầu thang bộ" />
          <Checkbox name="has_parking" label="Chỗ để xe" />
          <Checkbox name="has_basement" label="Hầm xe" />
          <Checkbox name="fingerprint_lock" label="Khóa vân tay" />
          <Checkbox name="shared_washer" label="Máy giặt chung" />
          <Checkbox name="private_washer" label="Máy giặt riêng" />
          <Checkbox name="shared_dryer" label="Máy sấy chung" />
          <Checkbox name="private_dryer" label="Máy sấy riêng" />
          <Checkbox name="short_term" label="Cho thuê ngắn hạn" />
          <Checkbox name="long_term" label="Cho thuê dài hạn" defaultChecked />
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Field label="Chính sách thú cưng" htmlFor="pet_policy">
            <select id="pet_policy" name="pet_policy" className={INPUT_CLASS}>
              <option value="no_pet">Không nhận thú cưng</option>
              <option value="allowed">Cho phép thú cưng</option>
            </select>
          </Field>

          <div className="flex items-end gap-4 pb-2">
            <Checkbox name="allow_cat" label="Cho phép mèo" />
            <Checkbox name="allow_dog" label="Cho phép chó" />
          </div>

          <div className="md:col-span-2">
            <Field label="Tiện nghi khác" htmlFor="other_amenities">
              <textarea
                id="other_amenities"
                name="other_amenities"
                className={`${INPUT_CLASS} min-h-20 resize-y`}
                maxLength={2000}
                placeholder="Ban công, cửa sổ, máy lạnh..."
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Ảnh và video">
        <Field
          label="Chọn media"
          htmlFor="media_files"
          hint="Tối đa 20 file. Ảnh tối đa 15 MB; video tối đa 50 MB. Ảnh đầu tiên sẽ làm ảnh đại diện."
        >
          <input
            id="media_files"
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleFiles}
            disabled={submitting}
            className="block w-full rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
          />
        </Field>

        {files.length > 0 ? (
          <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm">
            <p className="font-medium">Đã chọn: {fileSummary}</p>
            <ul className="mt-2 max-h-36 space-y-1 overflow-auto text-gray-600">
              {files.map((file) => (
                <li key={`${file.name}-${file.lastModified}`}>
                  {file.name} — {formatBytes(file.size)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
        Phòng sẽ được xuất bản công khai tự động sau khi thông tin và toàn bộ
        ảnh/video được lưu thành công. Hãy kiểm tra giá thuê, mô tả và media
        trước khi tạo phòng.
      </div>

      {uploadStatus ? (
        <div className="rounded-lg border bg-white p-4 text-sm">
          Đang tải file {uploadStatus.current}/{uploadStatus.total}: {uploadStatus.fileName}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
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
          {submitting ? "Đang tạo và xuất bản..." : "Tạo và xuất bản phòng"}
        </button>
      </div>
    </form>
  );
}

async function createPresignedUpload(
  roomId: string,
  file: File,
): Promise<PresignResult> {
  const response = await fetch("/api/upload/r2-presign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      room_id: roomId,
      file_name: file.name,
      content_type: file.type,
      size: file.size,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | PresignResult
    | { error?: string }
    | null;

  if (!response.ok || !payload || !("uploadUrl" in payload)) {
    throw new Error(
      payload && "error" in payload && payload.error
        ? payload.error
        : `Không thể tạo URL upload cho ${file.name}`,
    );
  }

  return payload;
}

async function uploadToR2(file: File, presign: PresignResult) {
  const response = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: presign.requiredHeaders ?? {
      "Content-Type": file.type,
    },
    body: file,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Upload ${file.name} lên R2 thất bại (${response.status})${
        detail ? `: ${detail.slice(0, 200)}` : ""
      }`,
    );
  }
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="mb-5 text-lg font-semibold">{title}</h2>
      {children}
    </section>
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

function FeeField({
  label,
  valueName,
  unitName,
  defaultUnit,
}: {
  label: string;
  valueName: string;
  unitName: string;
  defaultUnit: string;
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
          placeholder="Số tiền"
        />
        <input
          name={unitName}
          className={INPUT_CLASS}
          maxLength={2000}
          placeholder={defaultUnit}
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
    <label className="flex items-center gap-2 text-sm text-gray-800">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-gray-300"
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
