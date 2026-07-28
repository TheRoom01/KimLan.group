"use client";

import { ChangeEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { readApiResponse } from "@/lib/api/client";

const MAX_IDENTITY_IMAGE_BYTES = 10 * 1024 * 1024;

type CreateContractResult = {
  tenant_id?: string | null;
  contract_id?: string | null;
};

type PresignResult = {
  key: string;
  publicUrl: string;
  uploadUrl: string;
  requiredHeaders?: Record<string, string>;
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function nextYearString() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

export default function TenantCreateForm({ roomId }: { roomId: string }) {
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
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  function handleIdentityImage(
    event: ChangeEvent<HTMLInputElement>,
    side: "front" | "back",
  ) {
    const file = event.target.files?.[0] ?? null;
    if (file && (!file.type.startsWith("image/") || file.size > MAX_IDENTITY_IMAGE_BYTES)) {
      setErrorMessage("Ảnh CCCD phải là file hình ảnh và không vượt quá 10 MB.");
      event.target.value = "";
      return;
    }

    setErrorMessage(null);
    if (side === "front") setFrontImage(file);
    else setBackImage(file);
  }

  async function uploadIdentityImage(
    tenantId: string,
    file: File,
    side: "front" | "back",
  ) {
    const response = await fetch("/api/upload/r2-presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_id: roomId,
        tenant_id: tenantId,
        tenant_side: side,
        file_name: file.name,
        content_type: file.type,
        size: file.size,
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | PresignResult
      | { error?: string }
      | null;

    if (
      !response.ok ||
      !payload ||
      !("uploadUrl" in payload) ||
      !("publicUrl" in payload) ||
      !("key" in payload)
    ) {
      throw new Error(
        payload && "error" in payload
          ? payload.error || "Không thể chuẩn bị tải ảnh CCCD."
          : "Không thể chuẩn bị tải ảnh CCCD."
      );
    }

    const presign = payload;
    const uploadResponse = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: presign.requiredHeaders ?? { "Content-Type": file.type },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Không thể tải ảnh CCCD mặt ${side === "front" ? "trước" : "sau"}.`);
    }

    return presign;
  }

  async function submit() {
    try {
      setLoading(true);
      setErrorMessage(null);
      setProgress("Đang tạo hợp đồng...");

      const response = await fetch(`/api/owner/rooms/${roomId}/tenant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await readApiResponse<CreateContractResult>(response);

      if (result.tenant_id && (frontImage || backImage)) {
        const uploaded: {
          cccd_front_url?: string;
          cccd_front_path?: string;
          cccd_back_url?: string;
          cccd_back_path?: string;
        } = {};

        if (frontImage) {
          setProgress("Đang tải CCCD mặt trước...");
          const front = await uploadIdentityImage(result.tenant_id, frontImage, "front");
          uploaded.cccd_front_url = front.publicUrl;
          uploaded.cccd_front_path = front.key;
        }

        if (backImage) {
          setProgress("Đang tải CCCD mặt sau...");
          const back = await uploadIdentityImage(result.tenant_id, backImage, "back");
          uploaded.cccd_back_url = back.publicUrl;
          uploaded.cccd_back_path = back.key;
        }

        setProgress("Đang lưu ảnh CCCD...");
        await readApiResponse(
          await fetch(`/api/owner/tenants/${result.tenant_id}/identity`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ room_id: roomId, ...uploaded }),
          }),
        );
      }

      router.push(`/owner/rooms/${roomId}`);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Tạo hợp đồng thất bại",
      );
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  const fields = [
    { key: "full_name", label: "Họ tên người đại diện", type: "text" },
    { key: "phone", label: "Số điện thoại", type: "tel" },
    { key: "cccd", label: "Số CCCD", type: "text" },
    { key: "start_date", label: "Ngày bắt đầu", type: "date" },
    { key: "end_date", label: "Ngày kết thúc", type: "date" },
  ] as const;

  return (
    <div className="space-y-5 rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6547]">
          Hợp đồng thuê
        </p>
        <h2 className="mt-1 text-xl font-bold text-[#432918]">
          Thêm người đại diện
        </h2>
        <p className="mt-1 text-sm leading-6 text-[#80634a]">
          Sau khi tạo hợp đồng, bạn có thể thêm người ở cùng trong trang quản lý phòng.
        </p>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {progress ? (
        <div className="rounded-xl border border-[#d9bd99] bg-[#f8ead7] p-3 text-sm text-[#684324]">
          {progress}
        </div>
      ) : null}

      {fields.map((field) => (
        <label key={field.key} className="block">
          <span className="mb-1.5 block text-xs font-semibold text-[#5a3b25]">
            {field.label}
          </span>
          <input
            id={field.key}
            className="h-11 w-full rounded-xl border border-[#aa825d]/30 bg-[#fffdf8] px-3.5 text-sm text-[#4d3422] outline-none transition focus:border-[#744722] focus:ring-4 focus:ring-[#744722]/10"
            type={field.type}
            value={form[field.key]}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                [field.key]: event.target.value,
              }))
            }
          />
        </label>
      ))}

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          ["monthly_price", "Giá thuê"],
          ["deposit_amount", "Tiền cọc"],
        ].map(([key, label]) => (
          <label key={key} className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[#5a3b25]">
              {label}
            </span>
            <input
              id={key}
              type="number"
              min={0}
              className="h-11 w-full rounded-xl border border-[#aa825d]/30 bg-[#fffdf8] px-3.5 text-sm text-[#4d3422] outline-none transition focus:border-[#744722] focus:ring-4 focus:ring-[#744722]/10"
              value={form[key as "monthly_price" | "deposit_amount"]}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  [key]: Number(event.target.value),
                }))
              }
            />
          </label>
        ))}
      </div>

      <div className="rounded-2xl border border-[#aa825d]/25 bg-[#f8ead7] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#4d3422]">Ảnh CCCD người đại diện</h3>
            <p className="mt-1 text-xs leading-5 text-[#80634a]">
              Có thể bỏ qua và bổ sung sau. Ảnh chỉ hiển thị trong khu vực Owner.
            </p>
          </div>
          <span className="rounded-full bg-[#ead3b3] px-2.5 py-1 text-[10px] font-bold text-[#684324]">
            Tối đa 10 MB/ảnh
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            { side: "front" as const, label: "Mặt trước", file: frontImage },
            { side: "back" as const, label: "Mặt sau", file: backImage },
          ].map(({ side, label, file }) => (
            <label
              key={side}
              className="flex cursor-pointer flex-col justify-center rounded-xl border border-dashed border-[#aa825d]/40 bg-[#fff9ef] p-4 text-center transition hover:border-[#744722] hover:bg-[#fffdf8]"
            >
              <span className="text-sm font-semibold text-[#5b3b24]">{label}</span>
              <span className="mt-1 truncate text-xs text-[#90745a]">
                {file instanceof File ? file.name : "Chọn ảnh"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) =>
                  handleIdentityImage(event, side)
                }
              />
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={loading}
        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#744722] px-5 text-sm font-semibold text-[#fff8eb] shadow-sm transition hover:bg-[#623817] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Đang xử lý..." : "Tạo hợp đồng"}
      </button>
    </div>
  );
}
