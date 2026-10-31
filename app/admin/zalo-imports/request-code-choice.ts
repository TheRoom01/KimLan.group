"use client";
export type CodeApprovalMode = "update_room" | "create_room_new_code";
/** Native dialog supplies focus trapping, Escape, and an inert background. */
export function requestCodeChoice(oldCode: string, newCode: string, canUpdate: boolean): Promise<CodeApprovalMode | null> {
  return new Promise(resolve => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = document.createElement("dialog");
    dialog.className = "zalo-code-choice";
    dialog.setAttribute("aria-labelledby", "zalo-code-choice-title");
    Object.assign(dialog.style, { position: "fixed", inset: "50% auto auto 50%", transform: "translate(-50%, -50%)", margin: "0", width: "min(440px, calc(100vw - 32px))", boxSizing: "border-box", padding: "22px", border: "1px solid #e2e8f0", borderRadius: "16px", color: "#0f172a", boxShadow: "0 24px 80px #0004" });
    const style = document.createElement("style");style.textContent = ".zalo-code-choice::backdrop { background: rgba(15,23,42,.45); }";dialog.append(style);
    const title = document.createElement("h3");title.id = "zalo-code-choice-title";title.textContent = "Chọn cách duyệt phòng";title.style.margin = "0 0 12px";dialog.append(title);
    const description = document.createElement("p");description.textContent = `Mã phòng cũ: ${oldCode}. Mã mới trong imports: ${newCode}.`;dialog.append(description);
    let finished = false;
    const finish = (mode: CodeApprovalMode | null) => { if (finished) return; finished = true; dialog.close(); dialog.remove(); previousFocus?.focus(); resolve(mode); };
    const add = (text: string, mode: CodeApprovalMode | null, disabled = false) => {
      const button = document.createElement("button");button.type = "button";button.textContent = text;button.disabled = disabled;
      Object.assign(button.style, { display: "block", width: "100%", padding: "12px", marginTop: "10px", borderRadius: "10px", border: "1px solid #cbd5e1", background: mode === "create_room_new_code" ? "#2563eb" : "#f8fafc", color: mode === "create_room_new_code" ? "white" : "#0f172a", opacity: disabled ? ".5" : "1", cursor: disabled ? "not-allowed" : "pointer", textAlign: "left", fontWeight: "600" });
      button.onclick = () => finish(mode);dialog.append(button);
    };
    add("1. Vẫn cập nhật thông tin phòng cũ", "update_room", !canUpdate);
    if (!canUpdate) { const note = document.createElement("small");note.textContent = "Chọn các trường cần áp dụng trong phần so sánh nếu muốn cập nhật phòng cũ.";dialog.append(note); }
    add("2. Tạo phòng với mã phòng mới", "create_room_new_code");add("Hủy", null);
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
    document.body.append(dialog);dialog.showModal();
  });
}
