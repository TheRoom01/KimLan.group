"use client";

import { isAvailabilityDate } from "@/lib/rooms/availability";

/** Native top-layer dialog also works from inside an existing room modal. */
export function requestAvailabilityDate(current?: string | null): Promise<string | null> {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = document.createElement("dialog");
    dialog.className = "m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-[#d9bd99] bg-[#fff9ef] p-6 text-[#4f321e] shadow-2xl backdrop:bg-black/50";
    dialog.setAttribute("aria-label", "Chọn ngày phòng trống");
    dialog.addEventListener("keydown", (event) => event.stopPropagation());
    const form = document.createElement("form");
    form.method = "dialog";
    const title = document.createElement("h2");
    title.className = "text-lg font-bold";
    title.textContent = "Chọn ngày phòng trống";
    const label = document.createElement("label");
    label.className = "mt-4 block text-sm font-medium";
    label.textContent = "Ngày dự kiến trống";
    const input = document.createElement("input");
    input.type = "date";
    input.required = true;
    input.setAttribute("aria-label", "Ngày dự kiến trống");
    input.className = "mt-2 block w-full rounded-xl border border-[#d9bd99] bg-white px-3 py-2";
    input.value = isAvailabilityDate(current) ? current : "";
    label.append(input);
    const actions = document.createElement("div");
    actions.className = "mt-5 flex justify-end gap-3";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Hủy";
    cancel.className = "rounded-xl border border-[#d9bd99] px-4 py-2 text-sm font-semibold";
    cancel.onclick = () => dialog.close();
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "Xác nhận";
    save.className = "rounded-xl bg-[#744722] px-4 py-2 text-sm font-bold text-white";
    actions.append(cancel, save);
    form.append(title, label, actions);
    dialog.append(form);
    let selected: string | null = null;
    form.onsubmit = (event) => {
      event.preventDefault();
      if (!isAvailabilityDate(input.value)) { input.reportValidity(); return; }
      selected = input.value;
      dialog.close();
    };
    dialog.addEventListener("close", () => {
      dialog.remove();
      previousFocus?.focus();
      resolve(selected);
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
  });
}
