"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useRef, useState } from "react";
import { CreditCard, Loader2, Save, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { readApiResponse } from "@/lib/api/client";
import { prepareImageForUpload, resolveUploadContentType } from "@/lib/media/uploadFileType";

type Tenant = {
  id: string;
  full_name: string;
  phone?: string | null;
  cccd?: string | null;
  date_of_birth?: string | null;
  address?: string | null;
  cccd_front_url?: string | null;
  cccd_back_url?: string | null;
};

type PresignResult = {
  key: string;
  publicUrl: string;
  uploadUrl: string;
  requiredHeaders?: Record<string, string>;
};

const MAX_BYTES = 10 * 1024 * 1024;
const INPUT = "w-full rounded-xl border border-[#aa825d]/30 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#744722]";

export default function TenantProfileEditor({ tenant, roomId }: { tenant: Tenant; roomId?: string | null }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [files, setFiles] = useState<{ front?: File; back?: File }>({});
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  async function choose(file: File | undefined, side: "front" | "back") {
    if (!file) return;
    let prepared: File;
    try {
      prepared = await prepareImageForUpload(file);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xử lý ảnh CCCD.");
      return;
    }
    if (!resolveUploadContentType(prepared).startsWith("image/") || prepared.size > MAX_BYTES) {
      setMessage("Ảnh CCCD phải là hình ảnh và không vượt quá 10 MB.");
      return;
    }
    setFiles((current) => ({ ...current, [side]: prepared }));
    setMessage(null);
  }

  async function upload(file: File, side: "front" | "back") {
    if (!roomId) throw new Error("Không xác định được phòng của khách thuê.");
    const response = await fetch("/api/upload/r2-presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: roomId, tenant_id: tenant.id, tenant_side: side, file_name: file.name, content_type: file.type, size: file.size }),
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

    const presign = payload;
    const uploaded = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: presign.requiredHeaders ?? { "Content-Type": file.type },
      body: file,
    });
    if (!uploaded.ok) throw new Error(`Không thể upload CCCD mặt ${side === "front" ? "trước" : "sau"}.`);
    return presign;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const form = new FormData(event.currentTarget);
      await readApiResponse(await fetch(`/api/owner/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      }));

      if (files.front || files.back) {
        const identity: Record<string, string> = { room_id: String(roomId) };
        if (files.front) {
          const result = await upload(files.front, "front");
          identity.cccd_front_url = result.publicUrl;
          identity.cccd_front_path = result.key;
        }
        if (files.back) {
          const result = await upload(files.back, "back");
          identity.cccd_back_url = result.publicUrl;
          identity.cccd_back_path = result.key;
        }
        await readApiResponse(await fetch(`/api/owner/tenants/${tenant.id}/identity`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(identity),
        }));
      }
      setFiles({});
      setMessage("Đã lưu hồ sơ khách thuê.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu hồ sơ khách thuê.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Họ tên"><input name="full_name" required defaultValue={tenant.full_name} className={INPUT} /></Field>
        <Field label="Số điện thoại"><input name="phone" defaultValue={tenant.phone ?? ""} className={INPUT} /></Field>
        <Field label="Số CCCD"><input name="cccd" defaultValue={tenant.cccd ?? ""} className={INPUT} /></Field>
        <Field label="Ngày sinh"><input name="date_of_birth" type="date" defaultValue={tenant.date_of_birth ?? ""} className={INPUT} /></Field>
        <div className="lg:col-span-2">
          <Field label="Địa chỉ">
            <AutoGrowingAddress defaultValue={tenant.address ?? ""} />
          </Field>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(["front", "back"] as const).map((side) => {
          const file = files[side];
          const currentUrl = side === "front" ? tenant.cccd_front_url : tenant.cccd_back_url;
          const inputRef = side === "front" ? frontRef : backRef;
          return (
            <button key={side} type="button" onClick={() => inputRef.current?.click()}
              onDragOver={(event: DragEvent) => event.preventDefault()}
              onDrop={(event: DragEvent) => { event.preventDefault(); void choose(event.dataTransfer.files?.[0], side); }}
              className="overflow-hidden rounded-2xl border-2 border-dashed border-[#aa825d]/35 bg-[#f8ead7] text-left transition hover:border-[#744722]">
              <input ref={inputRef} type="file" accept="image/*,.heic,.heif" className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => { const selected = event.target.files?.[0]; event.target.value = ""; void choose(selected, side); }} />
              <div className="flex items-center gap-2 border-b border-[#aa825d]/20 px-4 py-3 text-sm font-bold text-[#5a3b25]"><CreditCard size={16} /> CCCD mặt {side === "front" ? "trước" : "sau"}</div>
              {file ? <img src={URL.createObjectURL(file)} alt="Ảnh mới" className="h-44 w-full object-contain p-3" />
                : currentUrl ? <img src={currentUrl} alt="CCCD" className="h-44 w-full object-contain p-3" />
                : <div className="grid h-36 place-items-center px-4 text-center text-sm text-[#80634a]"><span><Upload className="mx-auto mb-2" size={22} />Kéo thả ảnh hoặc bấm để upload</span></div>}
            </button>
          );
        })}
      </div>
      {message ? <p className="rounded-xl bg-[#f8ead7] p-3 text-sm text-[#684324]">{message}</p> : null}
      <button disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#744722] px-5 text-sm font-bold text-white disabled:opacity-50">
        {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} Lưu hồ sơ
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1.5"><span className="block text-xs font-semibold text-[#5a3b25]">{label}</span>{children}</label>;
}

function AutoGrowingAddress({ defaultValue }: { defaultValue: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    resizeAddress(ref.current);
  }, []);

  return (
    <textarea
      ref={ref}
      name="address"
      rows={1}
      defaultValue={defaultValue}
      onInput={(event) => resizeAddress(event.currentTarget)}
      className={`${INPUT} min-h-11 resize-none overflow-hidden leading-6`}
    />
  );
}

function resizeAddress(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}
