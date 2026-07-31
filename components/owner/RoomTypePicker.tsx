"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ROOM_TYPE_OPTIONS } from "@/lib/filterOptions";

export default function RoomTypePicker({
  id = "room_type",
  name = "room_type",
  initialValue,
  disabled = false,
}: {
  id?: string;
  name?: string;
  initialValue?: string | null;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState(String(initialValue ?? "").trim());
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const syncExternalValue = () => setSelected(input.value);
    input.addEventListener("change", syncExternalValue);
    return () => input.removeEventListener("change", syncExternalValue);
  }, []);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const choose = (value: string) => {
    setSelected(value);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <input ref={inputRef} type="hidden" name={name} value={selected} readOnly />
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#aa825d]/35 bg-white px-3 py-2 text-left text-sm outline-none transition hover:border-[#8e623d] focus:border-[#744722] focus:ring-2 focus:ring-[#aa825d]/20 disabled:opacity-50"
      >
        <span className={selected ? "font-medium text-[#4d3422]" : "text-[#9a7758]"}>
          {selected || "Chọn loại phòng"}
        </span>
        <ChevronDown
          size={17}
          className={`shrink-0 text-[#80634a] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          id={`${id}-options`}
          role="listbox"
          aria-label="Chọn loại phòng"
          className="absolute left-0 right-0 top-full z-50 mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-[#956b45]/25 bg-[#fff9ef] p-3 shadow-xl"
        >
          {ROOM_TYPE_OPTIONS.map((option) => {
            const active = selected === option;
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => choose(option)}
                className={`flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                  active
                    ? "border-[#744722] bg-[#744722] text-white shadow-sm"
                    : "border-[#aa825d]/25 bg-white text-[#684324] hover:bg-[#f3e1c9]"
                }`}
              >
                <span>{option}</span>
                {active ? <Check size={16} className="shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
