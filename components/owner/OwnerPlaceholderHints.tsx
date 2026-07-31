"use client";

import { useEffect } from "react";

const FIELD_HINTS: Record<string, string> = {
  house_number: "Ví dụ: 177/10/11",
  address: "Nhập tên đường hoặc địa chỉ",
  ward: "Nhập phường / xã",
  district: "Nhập quận / huyện",
  city: "Nhập tỉnh / thành phố",
  room_code: "Ví dụ: Phòng 203",
  room_type: "Ví dụ: Studio",
  price: "Nhập giá thuê",
  phone: "Ví dụ: 0901234567",
  zalo_phone: "Nhập số điện thoại Zalo",
  link_zalo: "Nhập link Zalo",
  email: "Ví dụ: ten@email.com",
  full_name: "Nhập họ và tên",
  cccd: "Nhập số CCCD",
  note: "Nhập ghi chú",
  description: "Nhập nội dung mô tả",
  chinh_sach: "Nhập chính sách áp dụng",
};

const SKIPPED_TYPES = new Set(["button", "checkbox", "file", "hidden", "image", "radio", "reset", "submit"]);

function labelText(field: HTMLInputElement | HTMLTextAreaElement) {
  const name = field.name || field.id;
  if (FIELD_HINTS[name]) return FIELD_HINTS[name];
  const explicit = field.id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(field.id)}"]`) : null;
  const wrapping = field.closest("label");
  const label = explicit?.textContent || wrapping?.textContent || field.getAttribute("aria-label") || "";
  const clean = label.replace(/\s+/g, " ").replace(/[*:]+$/g, "").trim();
  return clean ? `Nhập ${clean.toLocaleLowerCase("vi")}` : "Nhập thông tin";
}

function applyPlaceholder(field: HTMLInputElement | HTMLTextAreaElement) {
  if (field instanceof HTMLInputElement && SKIPPED_TYPES.has(field.type)) return;
  if (!field.hasAttribute("placeholder")) {
    field.setAttribute("placeholder", labelText(field));
  }
}

export default function OwnerPlaceholderHints() {
  useEffect(() => {
    const applyAfterInteraction = (event: Event) => {
      const field = event.target;
      if (
        !(field instanceof HTMLInputElement) &&
        !(field instanceof HTMLTextAreaElement)
      ) {
        return;
      }

      // Avoid changing attributes while another client island is hydrating.
      window.setTimeout(() => applyPlaceholder(field), 0);
    };

    document.addEventListener("focusin", applyAfterInteraction);
    return () => document.removeEventListener("focusin", applyAfterInteraction);
  }, []);
  return null;
}
