"use client";

import Link from "next/link";
import { ArrowRight, Loader2, Phone, Plus, UserRound, Users, X } from "lucide-react";
import { ChangeEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { readApiResponse } from "@/lib/api/client";
import type { OwnerTenantReference } from "@/lib/owner/types";
import { prepareImageForUpload, resolveUploadContentType } from "@/lib/media/uploadFileType";

const MAX_IDENTITY_IMAGE_BYTES = 10 * 1024 * 1024;

type PresignResult = {
  key: string;
  publicUrl: string;
  uploadUrl: string;
  requiredHeaders?: Record<string, string>;
};

export default function TenantRosterCard({
  tenants,
  roomId,
  canManage,
  isArchived,
}: {
  tenants: OwnerTenantReference[];
  roomId: string;
  canManage: boolean;
  isArchived: boolean;
}) {
  const router = useRouter();
  const [showAddForm, setShowAddForm] = useState(false);
  const [savingOccupant, setSavingOccupant] = useState(false);
  const [occupantError, setOccupantError] = useState<string | null>(null);
  const [occupantProgress, setOccupantProgress] = useState<string | null>(null);
  const [occupantFrontImage, setOccupantFrontImage] = useState<File | null>(null);
  const [occupantBackImage, setOccupantBackImage] = useState<File | null>(null);
  const [occupantForm, setOccupantForm] = useState({
    full_name: "",
    phone: "",
    cccd: "",
  });
  const representative =
    tenants.find((tenant) => tenant.role === "Chủ hợp đồng") ?? tenants[0];

  async function handleOccupantImage(
    event: ChangeEvent<HTMLInputElement>,
    side: "front" | "back",
  ) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = "";
    const file = selected ? await prepareImageForUpload(selected).catch((error: unknown) => {
      setOccupantError(error instanceof Error ? error.message : "Không thể xử lý ảnh CCCD.");
      return null;
    }) : null;
    if (selected && !file) return;

    if (
      file &&
      (!resolveUploadContentType(file).startsWith("image/") ||
        file.size > MAX_IDENTITY_IMAGE_BYTES)
    ) {
      setOccupantError(
        "Ảnh CCCD phải là file hình ảnh và không vượt quá 10 MB.",
      );
      return;
    }

    setOccupantError(null);
    if (side === "front") setOccupantFrontImage(file);
    else setOccupantBackImage(file);
  }

  async function uploadOccupantImage(
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
          : "Không thể chuẩn bị tải ảnh CCCD.",
      );
    }

    const uploadResponse = await fetch(payload.uploadUrl, {
      method: "PUT",
      headers: payload.requiredHeaders ?? { "Content-Type": file.type },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error(
        `Không thể tải CCCD mặt ${side === "front" ? "trước" : "sau"}.`,
      );
    }

    return payload;
  }

  async function addOccupant() {
    setSavingOccupant(true);
    setOccupantError(null);
    setOccupantProgress("Đang thêm người ở cùng...");

    try {
      const response = await fetch(`/api/owner/rooms/${roomId}/occupants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(occupantForm),
      });
      const result = await readApiResponse<{
        tenant?: { id?: string | null } | null;
      }>(response);
      const tenantId = result.tenant?.id;

      if (tenantId && (occupantFrontImage || occupantBackImage)) {
        const uploaded: {
          cccd_front_url?: string;
          cccd_front_path?: string;
          cccd_back_url?: string;
          cccd_back_path?: string;
        } = {};

        if (occupantFrontImage) {
          setOccupantProgress("Đang tải CCCD mặt trước...");
          const front = await uploadOccupantImage(
            tenantId,
            occupantFrontImage,
            "front",
          );
          uploaded.cccd_front_url = front.publicUrl;
          uploaded.cccd_front_path = front.key;
        }

        if (occupantBackImage) {
          setOccupantProgress("Đang tải CCCD mặt sau...");
          const back = await uploadOccupantImage(
            tenantId,
            occupantBackImage,
            "back",
          );
          uploaded.cccd_back_url = back.publicUrl;
          uploaded.cccd_back_path = back.key;
        }

        setOccupantProgress("Đang lưu ảnh CCCD...");
        await readApiResponse(
          await fetch(`/api/owner/tenants/${tenantId}/identity`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ room_id: roomId, ...uploaded }),
          }),
        );
      }

      setOccupantForm({ full_name: "", phone: "", cccd: "" });
      setOccupantFrontImage(null);
      setOccupantBackImage(null);
      setShowAddForm(false);
      router.refresh();
    } catch (error) {
      setOccupantError(
        error instanceof Error ? error.message : "Không thể thêm người ở cùng",
      );
    } finally {
      setSavingOccupant(false);
      setOccupantProgress(null);
    }
  }

  return (
    <>
      <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Users size={20} className="text-[#744722]" />
              <h2 className="text-lg font-bold text-[#4f321e]">
                Khách thuê trong phòng
              </h2>
            </div>
            
          </div>
          <div className="flex items-center gap-2">
            <span className="w-fit rounded-full bg-[#ead3b3] px-2.5 py-1 text-xs font-semibold text-[#684324]">
              {tenants.length} người
            </span>
            {canManage && !isArchived && tenants.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowAddForm((current) => !current)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#9a704b]/30 bg-[#fffdf8] px-2.5 text-xs font-semibold text-[#684324] hover:bg-[#f3e1c9]"
              >
                {showAddForm ? <X size={14} /> : <Plus size={14} />}
                {showAddForm ? "Đóng" : "Thêm người ở cùng"}
              </button>
            ) : null}
          </div>
        </div>

        {showAddForm ? (
          <div className="mt-4 rounded-2xl border border-[#aa825d]/20 bg-[#f8ead7] p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["full_name", "Họ tên", "text"],
                ["phone", "Số điện thoại", "tel"],
                ["cccd", "Số CCCD", "text"],
              ].map(([key, label, type]) => (
                <label key={key} className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-[#5a3b25]">
                    {label}
                  </span>
                  <input
                    type={type}
                    value={occupantForm[key as keyof typeof occupantForm]}
                    onChange={(event) =>
                      setOccupantForm((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-xl border border-[#aa825d]/30 bg-[#fffdf8] px-3 text-sm text-[#4d3422] outline-none focus:border-[#744722] focus:ring-4 focus:ring-[#744722]/10"
                  />
                </label>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                {
                  side: "front" as const,
                  label: "CCCD mặt trước",
                  file: occupantFrontImage,
                },
                {
                  side: "back" as const,
                  label: "CCCD mặt sau",
                  file: occupantBackImage,
                },
              ].map(({ side, label, file }) => (
                <label
                  key={side}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-[#aa825d]/40 bg-[#fff9ef] px-3 py-3 text-sm text-[#5a3b25] hover:border-[#744722]"
                >
                  <span className="font-semibold">{label}</span>
                  <span className="max-w-[45%] truncate text-xs text-[#90745a]">
                    {file instanceof File ? file.name : "Chọn ảnh"}
                  </span>
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    className="sr-only"
                    onChange={(event) => void handleOccupantImage(event, side)}
                  />
                </label>
              ))}
            </div>
            {occupantError ? (
              <p className="mt-3 text-sm text-red-700">{occupantError}</p>
            ) : null}
            {occupantProgress ? (
              <p className="mt-3 text-sm font-medium text-[#684324]">
                {occupantProgress}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void addOccupant()}
              disabled={savingOccupant || !occupantForm.full_name.trim()}
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[#744722] px-4 text-sm font-semibold text-[#fff8eb] disabled:opacity-50"
            >
              {savingOccupant ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Lưu người ở cùng
            </button>
          </div>
        ) : null}

        {tenants.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-[#a9825f]/35 bg-[#f8ead7] p-4">
            <p className="text-sm text-[#80634a]">
              Chưa có khách thuê hiện tại.
            </p>
            {canManage && !isArchived ? (
              <Link
                href={`/owner/rooms/${roomId}/tenant/new`}
                className="mt-3 inline-flex h-10 items-center rounded-xl bg-[#744722] px-4 text-sm font-semibold text-[#fff8eb]"
              >
                Thêm người đại diện
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 divide-y divide-[#b58f69]/20 overflow-hidden rounded-2xl border border-[#aa825d]/20 bg-[#f8ead7]">
            {tenants.map((tenant) => {
              const isRepresentative =
                tenant.id === representative?.id ||
                tenant.role === "Chủ hợp đồng";

              return (
                <Link
                  key={tenant.id}
                  href={`/owner/tenants/${tenant.id}`}
                  className="flex w-full min-w-0 items-center justify-between gap-3 p-4 text-left transition hover:bg-[#f2dfc4]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#ead3b3] text-[#684324]">
                      <UserRound size={18} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-bold text-[#4d3422]">
                          {tenant.full_name}
                        </span>
                        {isRepresentative ? (
                          <span className="rounded-full bg-[#744722] px-2 py-0.5 text-[10px] font-bold text-[#fff8eb]">
                            Đại diện
                          </span>
                        ) : (
                          <span className="rounded-full bg-[#eadbc8] px-2 py-0.5 text-[10px] font-bold text-[#76573e]">
                            Ở cùng
                          </span>
                        )}
                      </span>
                      <span className="mt-1 flex items-center gap-1 text-xs text-[#80634a]">
                        <Phone size={12} />
                        {tenant.phone || "Chưa có SĐT"}
                      </span>
                    </span>
                  </span>
                  <ArrowRight size={16} className="shrink-0 text-[#9b7655]" />
                </Link>
              );
            })}
          </div>
        )}
      </section>

    </>
  );
}
