"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  id?: string;
  name?: string;
  value?: number;
  defaultValue?: unknown;
  onValueChange?: (value: number) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
};

function toAmount(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount > 0 ? Math.trunc(amount) : 0;
}

export default function MoneyInput({
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  className,
  placeholder = "0",
  required,
  disabled,
  ariaLabel,
}: Props) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(() => toAmount(defaultValue));
  const amount = controlled ? toAmount(value) : internalValue;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const input = hiddenInputRef.current;
    if (!input || controlled) return;
    const syncExternalValue = () => {
      const next = toAmount(input.value);
      setInternalValue(next);
      onValueChange?.(next);
    };
    input.addEventListener("change", syncExternalValue);
    return () => input.removeEventListener("change", syncExternalValue);
  }, [controlled, onValueChange]);

  const restoreCaret = (digitPosition: number) => {
    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      let seen = 0;
      let caret = input.value.length;
      for (let index = 0; index < input.value.length; index += 1) {
        if (/\d/.test(input.value[index])) seen += 1;
        if (seen === digitPosition) {
          caret = index + 1;
          break;
        }
      }
      input.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="relative min-w-0">
      {name ? <input ref={hiddenInputRef} type="hidden" name={name} value={amount || ""} readOnly /> : null}
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        className={`${className ?? ""} pr-9`}
        value={amount > 0 ? amount.toLocaleString("vi-VN") : ""}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => {
          const caret = event.currentTarget.selectionStart ?? event.currentTarget.value.length;
          const digitPosition = event.currentTarget.value.slice(0, caret).replace(/\D/g, "").length;
          const raw = event.currentTarget.value.replace(/\D/g, "");
          const next = raw ? Number.parseInt(raw, 10) : 0;
          if (!controlled) setInternalValue(next);
          onValueChange?.(next);
          restoreCaret(digitPosition);
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-bold text-[#6b4a32]">
        đ
      </span>
    </div>
  );
}
