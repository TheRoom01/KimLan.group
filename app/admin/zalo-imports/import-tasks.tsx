"use client";

import type { RoomForm, RoomDetail } from "@/app/admin/RoomModal/types";
import { useSyncExternalStore } from "react";

const recovery = new Map<string, { room: RoomForm; detail: RoomDetail; candidates?: { id: string; code?: string | null; name?: string | null }[] }>();
export function preserveImportForm(id: string, room: RoomForm, detail: RoomDetail, candidates?: { id: string; code?: string | null; name?: string | null }[]) { recovery.set(id, { room, detail, candidates }); }
export function getImportForm(id: string) { return recovery.get(id); }
export function clearImportForm(id: string) { recovery.delete(id); }

type Task = { action?: () => void; id: string; label: string; state: "running" | "success" | "error"; message: string };
let tasks: Task[] = [];
const listeners = new Set<() => void>();
const empty: Task[] = [];
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useImportTasks() { return useSyncExternalStore(subscribe, () => tasks, () => empty); }
export function isImportBusy(id: string) { return tasks.some(task => task.id === id && task.state === "running"); }
export function beginImportTask(id: string, label: string) {
  if (isImportBusy(id)) return false;
  tasks = [...tasks.filter(task => task.id !== id), { id, label, state: "running", message: "Đang xử lý…" }]; emit(); return true;
}
export function updateImportTask(id: string, message: string) {
  tasks = tasks.map(task => task.id === id && task.state === "running" ? { ...task, message } : task); emit();
}
export function finishImportTask(id: string, message: string, error = false, action?: () => void) {
  const task = tasks.find(item => item.id === id);
  if (!task) return;
  const completed: Task = { ...task, state: error ? "error" : "success", message, action };
  tasks = tasks.map(item => item.id === id ? completed : item); emit();
  if (!error) window.setTimeout(() => { tasks = tasks.filter(item => item !== completed); emit(); }, 5000);
}
export function ImportTaskToasts() {
  const active = useImportTasks();
  return <div aria-live="polite" aria-relevant="additions text" style={{ position: "fixed", top: "35vh", left: "50%", transform: "translateX(-50%)", zIndex: 100100, width: "min(420px, calc(100vw - 32px))", display: "grid", gap: 8, pointerEvents: "none", maxHeight: "55vh", overflowY: "auto" }}>
    {active.map(task => <div key={task.id} role={task.state === "error" ? "alert" : "status"} style={{ pointerEvents: "auto", padding: "12px 16px", borderRadius: 12, background: task.state === "error" ? "#fef2f2" : task.state === "success" ? "#ecfdf5" : "#eff6ff", color: task.state === "error" ? "#b91c1c" : "#1e3a5f", border: "1px solid #cbd5e1", boxShadow: "0 12px 36px #0f172a26" }}>
      <strong>{task.state === "running" ? "⏳ " : task.state === "error" ? "Lỗi: " : "✓ "}{task.label}</strong>
      <div style={{ marginTop: 4, fontSize: 13, overflowWrap: "anywhere" }}>{task.message}</div>
      {task.action && <button type="button" onClick={task.action} style={{ marginTop: 6, marginRight: 12 }}>Mở lại chỉnh sửa</button>}
      {task.state !== "running" && <button type="button" aria-label="Đóng thông báo" onClick={() => { tasks = tasks.filter(item => item !== task); emit(); }} style={{ marginTop: 6 }}>Đóng</button>}
    </div>)}
  </div>;
}
