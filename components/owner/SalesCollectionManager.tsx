"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Copy, ExternalLink, Link2, Loader2, Plus, X } from "lucide-react";
import { readApiResponse } from "@/lib/api/client";
import { MAX_SHARED_BUILDINGS } from "@/lib/sales-portal/collection";
import { isSalesLinkVisible } from "@/lib/sales-portal/linkLifecycle";

type Property = { id: string; name: string; fullAddress: string };
type PortalLink = { id: string; label: string; public_token: string | null; revoked_at: string | null; expires_at: string | null; document_ids: string[] };
type SavedCollection = { id: string; label: string; public_token: string; link_ids: string[]; created_at: string; expires_at: string | null; revoked_at: string | null };
function isActive(link: { revoked_at: string | null; expires_at: string | null }) { return !link.revoked_at && (!link.expires_at || Date.parse(link.expires_at) > Date.now()); }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "Không hết hạn"; }
const inputClass = "w-full rounded-xl border border-[#aa825d]/40 bg-white p-3 text-sm";

export default function SalesCollectionManager({ properties }: { properties: Property[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pendingLinks = useRef(new Set<string>());
  const touchedChoices = useRef(new Set<string>());
  const [selected, setSelected] = useState<string[]>([]);
  const [links, setLinks] = useState<Record<string, PortalLink[]>>({});
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [label, setLabel] = useState("Link đội Sale");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingLinks, setLoadingLinks] = useState(0);
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  const [view, setView] = useState<"list" | "create">("list");
  const [collections, setCollections] = useState<SavedCollection[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  useEffect(() => { if (dialog.current) dialog.current.scrollTop = 0; }, [view]);

  async function loadPropertyLinks(id: string, refresh = false) {
    if ((!refresh && links[id]) || pendingLinks.current.has(id)) return;
    pendingLinks.current.add(id);
    setLoadingLinks((count) => count + 1);
    try {
      const rows = await readApiResponse<PortalLink[]>(await fetch(`/api/owner/properties/${id}/sales-portal`, { cache: "no-store" }));
      const active = rows.filter((link) => link.public_token && isActive(link));
      setLinks((current) => ({ ...current, [id]: active }));
      setChoices((current) => touchedChoices.current.has(id) ? current : { ...current, [id]: active[0]?.id ?? "" });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể tải link tòa nhà"); }
    finally { pendingLinks.current.delete(id); setLoadingLinks((count) => count - 1); }
  }

  function selectProperty(id: string, checked: boolean) {
    setUrl("");
    setSelected((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id));
    if (checked) void loadPropertyLinks(id);
  }

  function selectAll(checked: boolean) {
    setUrl("");
    setMessage("");
    setSelected(checked ? properties.map((property) => property.id) : []);
    if (checked) properties.forEach((property) => { void loadPropertyLinks(property.id); });
  }

  function openSharing() {
    setView("list"); setMessage(""); setUrl("");
    void loadCollections();
    dialog.current?.showModal();
  }

  async function loadCollections() {
    setLoadingCollections(true);
    try { setCollections(await readApiResponse<SavedCollection[]>(await fetch("/api/owner/sales-collections", { cache: "no-store" }))); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không thể tải các link đã lưu"); }
    finally { setLoadingCollections(false); }
  }

  function openCreate() {
    touchedChoices.current.clear();
    setChoices(Object.fromEntries(Object.entries(links).map(([id, rows]) => [id, rows.find((link) => isActive(link))?.id ?? ""])));
    selectAll(true); setView("create");
    properties.forEach((property) => { void loadPropertyLinks(property.id, true); });
  }

  async function revokeCollection(id: string) {
    setBusy(true); setMessage("");
    try {
      await readApiResponse(await fetch(`/api/owner/sales-collections?id=${encodeURIComponent(id)}`, { method: "DELETE" }));
      setCollections((current) => current.map((link) => link.id === id ? { ...link, revoked_at: new Date().toISOString() } : link));
      setUrl(""); setMessage("Đã thu hồi link chia sẻ.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể thu hồi link"); }
    finally { setBusy(false); }
  }

  async function restoreCollection(id: string) {
    setBusy(true); setMessage("");
    try {
      const restored = await readApiResponse<SavedCollection>(await fetch(`/api/owner/sales-collections?id=${encodeURIComponent(id)}`, { method: "PATCH" }));
      setCollections((current) => current.map((link) => link.id === id ? restored : link));
      setMessage(isActive(restored) ? "Đã khôi phục link chia sẻ." : "Đã khôi phục link. Link này đã hết hạn và không được tự gia hạn.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể khôi phục link"); }
    finally { setBusy(false); }
  }

  async function createCollection() {
    if (!selected.length || selected.length > MAX_SHARED_BUILDINGS || busy || loadingLinks > 0) return;
    setBusy(true); setMessage(""); setUrl("");
    const linkIds: string[] = [];
    try {
      for (const id of selected) {
        const existing = links[id]?.find((link) => link.id === choices[id]);
        if (existing?.public_token && isActive(existing)) { linkIds.push(existing.id); continue; }
        const result = await readApiResponse<{ path: string; id: string }>(await fetch(`/api/owner/properties/${id}/sales-portal`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: label.trim(), expires_at: expiry ? new Date(`${expiry}T23:59:59+07:00`).toISOString() : null, document_ids: [] }),
        }));
        const token = result.path.split("/").pop()!;
        linkIds.push(result.id);
        const link: PortalLink = { id: result.id, label: label.trim(), public_token: token, revoked_at: null, expires_at: expiry ? new Date(`${expiry}T23:59:59+07:00`).toISOString() : null, document_ids: [] };
        setLinks((current) => ({ ...current, [id]: [link, ...(current[id] ?? [])] }));
        setChoices((current) => ({ ...current, [id]: link.id }));
      }
      const saved = await readApiResponse<SavedCollection>(await fetch("/api/owner/sales-collections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), link_ids: linkIds, expires_at: expiry ? new Date(`${expiry}T23:59:59+07:00`).toISOString() : null }),
      }));
      setCollections((current) => [saved, ...current]);
      setView("list");
      setUrl(`${window.location.origin}/sales?collection=${saved.public_token}`);
      setMessage("Đã tạo và lưu link chia sẻ.");
    } catch (error) { setMessage(`${error instanceof Error ? error.message : "Không thể tạo link"}. Các link đã tạo được giữ lại để thử tiếp.`); }
    finally { setBusy(false); }
  }

  async function copy(value = url) {
    setUrl(value);
    try { await navigator.clipboard.writeText(value); setMessage("Đã sao chép link."); }
    catch { setMessage("Không thể sao chép tự động. Bạn có thể chọn và sao chép đường dẫn bên dưới."); }
  }

  return <>
    <button type="button" onClick={openSharing} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#744722]/30 bg-white px-4 py-2.5 text-sm font-semibold text-[#744722] hover:bg-[#f8ead7] sm:w-auto"><Link2 size={17} />Chia sẻ link cho Sale</button>
    <dialog ref={dialog} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-[#d9bd99] bg-[#fff9ef] p-5 text-[#432918] shadow-2xl backdrop:bg-black/45" onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <div className="flex items-start justify-between gap-3"><h2 className="text-xl font-bold">{view === "list" ? "Link các tòa nhà của hệ thống" : "Chia sẻ nhiều tòa nhà cho Sale"}</h2><button type="button" aria-label="Đóng" disabled={busy} onClick={() => dialog.current?.close()} className="rounded-lg p-1"><X size={22} /></button></div>
      {view === "list" ? <>
        <p className="mt-2 text-sm text-[#80634a]">{collections.filter(isActive).length} link đang hoạt động</p>
        <section className="mt-5 rounded-2xl border border-[#d9bd99] bg-[#f8ead7] p-4"><h3 className="font-bold">Tạo link mới</h3><p className="mt-1 text-sm text-[#80634a]">Chọn tòa nhà và lưu một link để chia sẻ cho đội Sale.</p><button type="button" onClick={openCreate} disabled={busy || loadingCollections} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#744722] p-3 font-bold text-white disabled:opacity-50"><Plus size={18} />Tạo link mới</button></section>
        <div className="mb-3 mt-6 flex items-center justify-between gap-3"><div><h3 className="font-bold">Các link đã tạo</h3><p className="mt-1 text-xs text-[#80634a]">Link đã thu hồi hiển thị và có thể khôi phục trong 3 ngày.</p></div><button type="button" onClick={() => { setMessage(""); void loadCollections(); }} disabled={loadingCollections || busy} className="rounded-xl border border-[#d9bd99] bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50">Tải lại</button></div>
        {loadingCollections ? <p role="status" className="py-6 text-center text-sm">Đang tải các link đã lưu...</p> : <div className="space-y-3">{collections.filter((link) => isSalesLinkVisible(link)).map((link) => <article key={link.id} className="rounded-2xl border border-[#d9bd99]/60 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="min-w-0 break-words font-bold">{link.label}</h4><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${isActive(link) ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-gray-50 text-gray-600"}`}>{link.revoked_at ? "Đã thu hồi" : isActive(link) ? "Đang hoạt động" : "Đã hết hạn"}</span><button type="button" disabled={!isActive(link) || busy} onClick={() => void copy(`${window.location.origin}/sales?collection=${link.public_token}`)} className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700 disabled:opacity-40">Copy</button>{!link.revoked_at ? <button type="button" disabled={busy} onClick={() => void revokeCollection(link.id)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-bold text-red-600 disabled:opacity-40">Thu hồi</button> : <button type="button" disabled={busy} onClick={() => void restoreCollection(link.id)} className="rounded-lg border border-[#d9bd99] bg-[#fff9ef] px-2 py-1 text-xs font-bold text-[#744722] disabled:opacity-40">Khôi phục link</button>}</div></div>
          <p className="mt-3 text-sm text-[#80634a]">{link.link_ids.length} tòa nhà</p><div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><p className="text-xs text-[#80634a]">Ngày tạo</p><p className="mt-1 font-semibold">{formatDate(link.created_at)}</p></div><div><p className="text-xs text-[#80634a]">Ngày hết hạn</p><p className="mt-1 font-semibold">{formatDate(link.expires_at)}</p></div></div>
        </article>)}{!collections.length ? <p className="rounded-xl border border-dashed border-[#d9bd99] p-6 text-center text-sm text-[#80634a]">Chưa có link tổng hợp đã lưu. Bấm “Tạo link mới” để bắt đầu.</p> : null}</div>}
      </> : <>
      <button type="button" disabled={busy} onClick={() => { setView("list"); setMessage(""); setUrl(""); }} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold"><ArrowLeft size={16} />Các link đã tạo</button>
      <p className="mt-2 text-sm text-[#80634a]">Chọn tối đa {MAX_SHARED_BUILDINGS} tòa nhà để gộp vào một trang chia sẻ.</p>
      <fieldset disabled={busy} className="mt-4 space-y-3 disabled:opacity-60">
        <label className="block text-sm font-semibold">Tên link mới<input maxLength={120} value={label} onChange={(e) => { setLabel(e.target.value); setUrl(""); }} className={`mt-1 ${inputClass}`} /></label>
        <label className="block text-sm font-semibold">Ngày hết hạn cho link mới (không bắt buộc)<input type="date" value={expiry} onChange={(e) => { setExpiry(e.target.value); setUrl(""); }} className={`mt-1 ${inputClass}`} /></label>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d9bd99]/60 bg-[#f8ead7] px-3 py-2.5 text-sm font-semibold">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={properties.length > 0 && selected.length === properties.length} ref={(input) => { if (input) input.indeterminate = selected.length > 0 && selected.length < properties.length; }} disabled={!properties.length} onChange={(event) => selectAll(event.target.checked)} className="h-4 w-4 accent-[#744722]" />
            Chọn tất cả tòa nhà
          </label>
          <button type="button" onClick={() => selectAll(false)} disabled={!selected.length} className="rounded-lg px-2 py-1 text-[#744722] hover:bg-white/70 disabled:opacity-40">Xóa tất cả lựa chọn</button>
          <span className="w-full text-xs font-normal text-[#80634a]" aria-live="polite">Đã chọn {selected.length}/{properties.length} tòa nhà</span>
        </div>
        {selected.length > MAX_SHARED_BUILDINGS ? <p role="alert" className="text-sm text-red-700">Mỗi link hỗ trợ tối đa {MAX_SHARED_BUILDINGS} tòa nhà. Vui lòng bỏ bớt lựa chọn trước khi tạo link.</p> : null}
        <div className="max-h-72 space-y-2 overflow-y-auto">{properties.map((property) => <div key={property.id} className="rounded-xl border border-[#d9bd99]/60 bg-white p-3">
          <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={selected.includes(property.id)} disabled={!selected.includes(property.id) && selected.length >= MAX_SHARED_BUILDINGS} onChange={(e) => void selectProperty(property.id, e.target.checked)} className="mt-1 h-4 w-4 accent-[#744722]" /><span className="min-w-0"><strong className="block text-sm">{property.name}</strong></span></label>
          {selected.includes(property.id) ? <select aria-label={`Link cho ${property.name}`} value={choices[property.id] ?? ""} onChange={(e) => { touchedChoices.current.add(property.id); setChoices((current) => ({ ...current, [property.id]: e.target.value })); setUrl(""); }} className={`mt-2 ${inputClass}`}><option value="">Tạo link mới</option>{(links[property.id] ?? []).map((link) => <option key={link.id} value={link.id}>{link.label} · {link.document_ids.length} tài liệu</option>)}</select> : null}
        </div>)}</div>
        {!properties.length ? <p className="text-sm">Chưa có tòa nhà để chia sẻ.</p> : null}
        <button type="button" disabled={busy || loadingLinks > 0 || !selected.length || selected.length > MAX_SHARED_BUILDINGS || !label.trim()} onClick={() => void createCollection()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#744722] p-3 text-sm font-bold text-white disabled:opacity-50">{busy ? <Loader2 size={17} className="animate-spin" /> : <Link2 size={17} />}Tạo link ({selected.length} tòa nhà)</button>
      </fieldset>
      </>}
      {message ? <p role="status" className="mt-4 text-sm">{message}</p> : null}
      {url ? <div className="mt-3 space-y-2"><input aria-label="Link chia sẻ" value={url} readOnly onFocus={(e) => e.target.select()} className={inputClass} /><div className="flex gap-4 text-sm font-semibold"><button type="button" onClick={() => void copy()} className="inline-flex items-center gap-2"><Copy size={16} />Sao chép</button><a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2"><ExternalLink size={16} />Mở trang chia sẻ</a></div></div> : null}
    </dialog>
  </>;
}
