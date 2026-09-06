"use client";

import { useEffect, useRef, useState } from "react";
import { isSalesLinkVisible } from "@/lib/sales-portal/linkLifecycle";
import { ArrowLeft, Check, Copy, ExternalLink, FilePlus2, FileText, Link2, Loader2, Save, StickyNote, Trash2, X } from "lucide-react";

import { readApiResponse } from "@/lib/api/client";
import PropertyRoomCardGrid from "@/components/owner/PropertyRoomCardGrid";
import type { OwnerTenantReference } from "@/lib/owner/types";

type PortalLink = { id: string; label: string; public_token: string | null; expires_at: string | null; revoked_at: string | null; last_accessed_at: string | null; created_at: string; document_ids: string[] };
type PropertyDocument = { id: string; title: string; description: string | null; file_name: string; file_url: string; file_path: string | null; mime_type: string | null; size_bytes: number | null };
const DOCUMENT_INPUT_CLASS = "w-full rounded-xl !border !border-[#9a704b]/45 !bg-white px-3 text-[#432918] shadow-[inset_0_0_0_1px_rgba(154,112,75,0.04)] outline-none placeholder:text-[#a28368] focus:!border-[#744722] focus:!ring-2 focus:!ring-[#aa825d]/20";
type Room = {
  id: string;
  room_code?: string | null;
  room_type?: string | null;
  price?: number | null;
  status?: string | null;
  displayStatus?: string | null;
  contract?: { id?: string | null; start_date?: string | null; end_date?: string | null } | null;
  tenant?: OwnerTenantReference[] | OwnerTenantReference | null;
  tenants?: OwnerTenantReference[] | null;
};

export default function SalesPortalManager({
  propertyId,
  rooms,
  initialNotes,
  documentColumnAfter,
  sharingColumnAfter,
}: {
  propertyId: string;
  rooms: Room[];
  initialNotes: Record<string, string>;
  documentColumnAfter?: React.ReactNode;
  sharingColumnAfter?: React.ReactNode;
}) {
  const [links, setLinks] = useState<PortalLink[]>([]);
  const [documents, setDocuments] = useState<PropertyDocument[]>([]);
  const [linkSelections, setLinkSelections] = useState<Record<string, string[]>>({});
  const [newLinkDocumentIds, setNewLinkDocumentIds] = useState<string[]>([]);
  const [notes, setNotes] = useState(initialNotes);
  const [label, setLabel] = useState("Link đội Sale");
  const [expiresAt, setExpiresAt] = useState("");
  const [latestUrl, setLatestUrl] = useState<string | null>(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentDescription, setDocumentDescription] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const sharingDialog = useRef<HTMLDialogElement>(null);
  const [createLinkOpen, setCreateLinkOpen] = useState(false);
  const [noteRoomsOpen, setNoteRoomsOpen] = useState(false);
  const [selectedNoteRoomId, setSelectedNoteRoomId] = useState<string | null>(null);

  useEffect(() => { void load(true); }, [propertyId]);

  async function load(initializeNewLink = false) {
    try {
      const [linkRows, documentRows] = await Promise.all([
        readApiResponse<PortalLink[]>(await fetch(`/api/owner/properties/${propertyId}/sales-portal`, { cache: "no-store" })),
        readApiResponse<PropertyDocument[]>(await fetch(`/api/owner/properties/${propertyId}/sales-documents`, { cache: "no-store" })),
      ]);
      setLinks(linkRows);
      setDocuments(documentRows);
      setLinkSelections(Object.fromEntries(linkRows.map((link) => [link.id, link.document_ids])));
      if (initializeNewLink) setNewLinkDocumentIds(documentRows.map((document) => document.id));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể tải dữ liệu chia sẻ"); }
  }

  async function createLink() {
    setBusy("link"); setMessage(null);
    try {
      const result = await readApiResponse<{ path: string }>(await fetch(`/api/owner/properties/${propertyId}/sales-portal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, expires_at: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null, document_ids: newLinkDocumentIds }) }));
      const url = withShareVersion(`${window.location.origin}${result.path}`);
      setLatestUrl(url); await navigator.clipboard.writeText(url).catch(() => undefined);
      setMessage("Đã tạo, sao chép link và lưu bộ tài liệu đã chọn.");
      setCreateLinkOpen(false);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể tạo link"); } finally { setBusy(null); }
  }

  async function saveLinkDocuments(linkId: string) {
    setBusy(`selection-${linkId}`); setMessage(null);
    try {
      await readApiResponse(await fetch(`/api/owner/properties/${propertyId}/sales-portal/${linkId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document_ids: linkSelections[linkId] ?? [] }) }));
      setMessage("Đã cập nhật tài liệu riêng cho link Sale."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể cập nhật tài liệu"); } finally { setBusy(null); }
  }

  async function revokeLink(id: string) {
    setBusy(id); setMessage(null);
    try { await readApiResponse(await fetch(`/api/owner/properties/${propertyId}/sales-portal/${id}`, { method: "DELETE" })); if (latestUrl) setLatestUrl(null); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không thể thu hồi link"); } finally { setBusy(null); }
  }

  async function restoreLink(id: string) {
    setBusy(id); setMessage(null);
    try {
      await readApiResponse(await fetch(`/api/owner/properties/${propertyId}/sales-portal/${id}`, { method: "PATCH" }));
      const link = links.find((item) => item.id === id);
      setMessage(link?.expires_at && Date.parse(link.expires_at) <= Date.now() ? "Đã khôi phục link. Link này đã hết hạn và không được tự gia hạn." : "Đã khôi phục link chia sẻ.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể khôi phục link"); }
    finally { setBusy(null); }
  }

  async function copyPortalLink(link: PortalLink) {
    if (!link.public_token) { setMessage("Link cũ chưa có dữ liệu để copy. Vui lòng tạo lại link mới."); return; }
    await navigator.clipboard.writeText(withShareVersion(`${window.location.origin}/sales/${link.public_token}`));
    setCopiedLinkId(link.id); window.setTimeout(() => setCopiedLinkId(null), 1800);
  }

  async function uploadDocument() {
    const sharedUrl = documentUrl.trim();
    if (!file && !sharedUrl) { setMessage("Vui lòng chọn tệp hoặc dán link tài liệu trực tuyến."); return; }
    setBusy("document"); setMessage(null);
    try {
      let payload: { file_name: string; file_url: string; file_path: string | null; mime_type: string | null; size_bytes: number | null };
      let fallbackTitle: string;
      if (file) {
        const response = await fetch("/api/upload/r2-presign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ property_id: propertyId, sales_document: true, file_name: file.name, content_type: file.type || "application/octet-stream", size: file.size }) });
        const presign = await response.json() as { uploadUrl?: string; publicUrl?: string; key?: string; requiredHeaders?: Record<string, string>; error?: string };
        if (!response.ok || !presign.uploadUrl || !presign.publicUrl || !presign.key) throw new Error(presign.error || "Không thể chuẩn bị upload tài liệu");
        const uploaded = await fetch(presign.uploadUrl, { method: "PUT", headers: presign.requiredHeaders, body: file });
        if (!uploaded.ok) throw new Error("Không thể tải tài liệu lên kho lưu trữ");
        payload = { file_name: file.name, file_url: presign.publicUrl, file_path: presign.key, mime_type: file.type || null, size_bytes: file.size };
        fallbackTitle = file.name.replace(/\.[^.]+$/, "") || "Tài liệu tòa nhà";
      } else {
        let parsedUrl: URL;
        try { parsedUrl = new URL(sharedUrl); } catch { throw new Error("Link tài liệu không hợp lệ. Vui lòng dán đầy đủ link bắt đầu bằng https://"); }
        if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("Link tài liệu phải bắt đầu bằng http:// hoặc https://");
        payload = { file_name: parsedUrl.hostname, file_url: parsedUrl.toString(), file_path: null, mime_type: null, size_bytes: null };
        fallbackTitle = onlineDocumentTitle(parsedUrl);
      }
      const created = await readApiResponse<PropertyDocument>(await fetch(`/api/owner/properties/${propertyId}/sales-documents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: documentTitle.trim() || fallbackTitle, description: documentDescription, ...payload }) }));
      setDocumentTitle(""); setDocumentDescription(""); setDocumentUrl(""); setFile(null);
      setNewLinkDocumentIds((current) => [...current, created.id]);
      setMessage(file ? "Đã lưu tệp vào kho tài liệu của tòa nhà." : "Đã lưu link tài liệu trực tuyến vào kho của tòa nhà."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể thêm tài liệu"); } finally { setBusy(null); }
  }

  async function deleteDocument(id: string) {
    setBusy(id);
    try { await readApiResponse(await fetch(`/api/owner/properties/${propertyId}/sales-documents/${id}`, { method: "DELETE" })); setNewLinkDocumentIds((current) => current.filter((item) => item !== id)); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không thể xóa tài liệu"); } finally { setBusy(null); }
  }

  async function saveNote(roomId: string) {
    setBusy(roomId); setMessage(null);
    try {
      await readApiResponse(await fetch(`/api/owner/rooms/${roomId}/sales-note`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: notes[roomId] ?? "" }) }));
      setMessage("Đã lưu ghi chú cho Sale.");
      setSelectedNoteRoomId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu ghi chú");
    } finally { setBusy(null); }
  }

  const selectedNoteRoom = rooms.find((room) => room.id === selectedNoteRoomId) ?? null;

  return <>
    <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-2">
    <div className="contents min-w-0 lg:order-1 lg:block lg:space-y-5">
    <section className="order-1 min-w-0 max-w-full overflow-hidden rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_10px_25px_rgba(92,61,34,0.06)] [overflow-wrap:anywhere] [&_input]:max-w-full [&_input]:min-w-0 [&_textarea]:max-w-full [&_textarea]:min-w-0 sm:p-5">
      <div className="flex items-start gap-2"><FileText size={21} className="mt-0.5 shrink-0 text-[#744722]" /><div><h2 className="text-lg font-bold">Kho tài liệu tòa nhà</h2><p className="mt-1 text-xs text-[#80634a]">Upload một lần, sau đó chọn tài liệu cần chia sẻ cho từng link Sale.</p></div></div>
      {message && !shareOpen ? <div className="mt-4 rounded-xl border border-[#d9bd99] bg-[#f8ead7] px-4 py-3 text-sm text-[#684324]">{message}</div> : null}
      <div className="mt-4 space-y-3"><input value={documentTitle} onChange={(e) => setDocumentTitle(e.target.value)} placeholder="Tên tài liệu" className={`h-11 ${DOCUMENT_INPUT_CLASS}`} /><textarea value={documentDescription} onChange={(e) => setDocumentDescription(e.target.value)} placeholder="Mô tả ngắn (không bắt buộc)" rows={2} className={`${DOCUMENT_INPUT_CLASS} p-3`} /><div className="grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)]"><label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#8f633e] bg-[#fffaf2] px-3 text-sm font-semibold text-[#744722]"><FilePlus2 size={17} />{file?.name ? "Đã chọn tệp" : "Chọn tệp"}<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*" onChange={(e) => { setFile(e.target.files?.[0] ?? null); if (e.target.files?.[0]) setDocumentUrl(""); }} className="sr-only" /></label><input type="url" value={documentUrl} onChange={(e) => { setDocumentUrl(e.target.value); if (e.target.value) setFile(null); }} placeholder="Dán link Docs, Excel hoặc link bất kỳ" className={`h-11 min-w-0 ${DOCUMENT_INPUT_CLASS}`} /></div><button type="button" onClick={() => void uploadDocument()} disabled={busy === "document"} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#744722] font-semibold text-white disabled:opacity-50">{busy === "document" ? <Loader2 className="animate-spin" size={17} /> : <FilePlus2 size={17} />}Lưu vào kho tài liệu tòa nhà</button></div>
      <div className="mt-4 space-y-2">{documents.map((document) => <div key={document.id} className="flex items-center gap-3 rounded-xl bg-[#f8ead7] p-3 text-sm"><FileText size={17} className="shrink-0 text-[#744722]" /><a href={document.file_url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 hover:underline"><strong className="block truncate">{document.title}</strong><span className="block truncate text-xs text-[#80634a]">{document.file_name}</span></a><button onClick={() => void deleteDocument(document.id)} disabled={busy === document.id} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={17} /></button></div>)}</div>
    </section>
    <div className="order-3 min-w-0">{documentColumnAfter}</div>
    </div>

    <div className="contents min-w-0 lg:order-2 lg:block lg:space-y-5">
    <section className="order-2 min-w-0 rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 sm:p-6">
      <div className="flex items-center gap-2"><Link2 size={21} className="shrink-0 text-[#744722]" /><h2 className="text-lg font-bold sm:text-xl">Chia sẻ thông tin tòa nhà (cho Sale)</h2></div>
      <button type="button" onClick={() => { setMessage(null); setCreateLinkOpen(false); setShareOpen(true); sharingDialog.current?.showModal(); void load(); }} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#744722] px-4 font-bold text-white"><Link2 size={17} />Quản lý link chia sẻ</button>
      <dialog ref={sharingDialog} onClose={() => { setShareOpen(false); setCreateLinkOpen(false); }} onCancel={(event) => { if (busy) event.preventDefault(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-[#d9bd99] bg-[#fff9ef] p-5 text-[#432918] shadow-2xl backdrop:bg-black/45">
        <div className="flex items-start justify-between gap-3"><h2 className="text-xl font-bold">{createLinkOpen ? "Tạo link chia sẻ tòa nhà" : "Quản lý link chia sẻ cho Sale"}</h2><button type="button" disabled={Boolean(busy)} onClick={() => sharingDialog.current?.close()} aria-label="Đóng" className="rounded-lg p-1"><X size={22} /></button></div>
        {message ? <p role="status" className="mt-4 rounded-xl bg-[#f8ead7] p-3 text-sm">{message}</p> : null}
        {createLinkOpen ? <fieldset disabled={Boolean(busy)} className="mt-4 space-y-3">
          <button type="button" onClick={() => setCreateLinkOpen(false)} className="inline-flex items-center gap-1 text-sm font-semibold"><ArrowLeft size={16} />Các link đã tạo</button>
          <label className="block text-sm font-semibold">Tên link<input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} className="mt-1 h-11 w-full rounded-xl border border-[#aa825d]/30 bg-white px-3" /></label>
          <label className="block text-sm font-semibold">Ngày hết hạn (không bắt buộc)<input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#aa825d]/30 bg-white px-3" /></label>
          <DocumentChoices title="Tài liệu chia sẻ trong link mới" documents={documents} selected={newLinkDocumentIds} onChange={setNewLinkDocumentIds} />
          <button type="button" onClick={() => void createLink()} disabled={!label.trim() || Boolean(busy)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#744722] px-4 font-bold text-white disabled:opacity-50">{busy === "link" ? <Loader2 size={17} className="animate-spin" /> : <Link2 size={17} />}Tạo link</button>
        </fieldset> : <>
          <p className="mt-2 text-sm text-[#80634a]">{links.filter((link) => !link.revoked_at && (!link.expires_at || Date.parse(link.expires_at) > Date.now())).length} link đang hoạt động</p>
          <div className="mt-5 rounded-2xl border border-[#d9bd99] bg-[#f8ead7] p-4"><h3 className="font-bold">Tạo link mới</h3><p className="mt-1 text-sm text-[#80634a]">Chọn tài liệu riêng cho link chia sẻ tòa nhà.</p><button type="button" disabled={Boolean(busy)} onClick={() => { setMessage(null); setCreateLinkOpen(true); }} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#744722] px-4 font-bold text-white"><Link2 size={17} />Tạo link mới</button></div>
          <div className="mb-3 mt-6 flex items-center justify-between gap-3"><div><h3 className="font-bold">Các link đã tạo</h3><p className="mt-1 text-xs text-[#80634a]">Link đã thu hồi hiển thị và có thể khôi phục trong 3 ngày.</p></div><button type="button" disabled={Boolean(busy)} onClick={() => void load()} className="shrink-0 rounded-xl border border-[#d9bd99] bg-white px-3 py-2 text-sm font-semibold">Tải lại</button></div>
          <div className="space-y-3">{links.filter((link) => isSalesLinkVisible(link)).map((link) => {
            const active = !link.revoked_at && (!link.expires_at || Date.parse(link.expires_at) > Date.now());
            return <article key={link.id} className="rounded-2xl border border-[#d9bd99]/60 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="min-w-0 break-words font-bold">{link.label}</h4><div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${active ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-gray-50 text-gray-600"}`}>{link.revoked_at ? "Đã thu hồi" : active ? "Đang hoạt động" : "Đã hết hạn"}</span>
                <button type="button" disabled={!active || !link.public_token || Boolean(busy)} onClick={() => void copyPortalLink(link)} className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700 disabled:opacity-40">{copiedLinkId === link.id ? "Đã copy" : "Copy"}</button>
                {link.revoked_at ? <button type="button" disabled={Boolean(busy)} onClick={() => void restoreLink(link.id)} className="rounded-lg border border-[#d9bd99] bg-[#fff9ef] px-2 py-1 text-xs font-bold text-[#744722] disabled:opacity-40">Khôi phục link</button> : <button type="button" disabled={Boolean(busy)} onClick={() => void revokeLink(link.id)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-bold text-red-600 disabled:opacity-40">Thu hồi</button>}
              </div></div>
              <p className="mt-3 text-[#80634a]">{link.document_ids.length} tài liệu</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><p className="text-xs text-[#80634a]">Ngày tạo</p><p className="mt-1 font-semibold">{new Date(link.created_at).toLocaleString("vi-VN")}</p></div><div><p className="text-xs text-[#80634a]">Ngày hết hạn</p><p className="mt-1 font-semibold">{link.expires_at ? new Date(link.expires_at).toLocaleString("vi-VN") : "Không hết hạn"}</p></div></div>
              {!link.revoked_at ? <details className="mt-4"><summary className="cursor-pointer font-semibold text-[#744722]">Tài liệu riêng của link</summary><DocumentChoices title="Chọn tài liệu chia sẻ" documents={documents} selected={linkSelections[link.id] ?? []} onChange={(ids) => setLinkSelections((current) => ({ ...current, [link.id]: ids }))} /><button type="button" onClick={() => void saveLinkDocuments(link.id)} disabled={Boolean(busy)} className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-[#8f633e]/30 text-xs font-bold text-[#744722] disabled:opacity-50"><Save size={14} />Lưu bộ tài liệu cho link</button></details> : null}
            </article>;
          })}</div>
          {!links.some((link) => isSalesLinkVisible(link)) ? <p className="rounded-xl border border-dashed border-[#d9bd99] p-6 text-center text-sm text-[#80634a]">Chưa có link chia sẻ.</p> : null}
          <button type="button" onClick={() => { sharingDialog.current?.close(); setMessage(null); setSelectedNoteRoomId(null); setNoteRoomsOpen(true); }} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#8f633e]/30 px-4 font-bold text-[#744722]"><StickyNote size={18} />Thêm ghi chú cho từng phòng</button>
        </>}
        {latestUrl ? <div className="mt-3 flex min-w-0 items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><Check size={16} /><span className="min-w-0 flex-1 truncate">{latestUrl}</span><button type="button" onClick={() => void navigator.clipboard.writeText(latestUrl)} aria-label="Sao chép"><Copy size={16} /></button><a href={latestUrl} target="_blank" rel="noreferrer" aria-label="Mở link"><ExternalLink size={16} /></a></div> : null}
      </dialog>
    </section>
    <div className="order-4 min-w-0">{sharingColumnAfter}</div>
    </div>
    </div>

    {noteRoomsOpen ? (
      <div className="fixed inset-0 z-[600] grid place-items-center bg-black/45 p-3 backdrop-blur-sm" onMouseDown={() => setNoteRoomsOpen(false)}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selectedNoteRoom ? `Ghi chú phòng ${selectedNoteRoom.room_code || "-"}` : "Chọn phòng để thêm ghi chú"}
          onMouseDown={(event) => event.stopPropagation()}
          className={`max-h-[90dvh] w-full overflow-y-auto rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] shadow-2xl ${selectedNoteRoom ? "max-w-md p-5" : "max-w-4xl p-5 sm:p-6"}`}
        >
          {message ? <div className="mb-4 rounded-xl border border-[#d9bd99] bg-[#f8ead7] px-4 py-3 text-sm text-[#684324]">{message}</div> : null}
          {selectedNoteRoom ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => setSelectedNoteRoomId(null)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-[#744722] hover:bg-[#f8ead7]"><ArrowLeft size={16} /> Danh sách phòng</button>
                <button type="button" onClick={() => setNoteRoomsOpen(false)} className="rounded-lg p-1.5 text-[#684324] hover:bg-[#f8ead7]" aria-label="Đóng"><X size={19} /></button>
              </div>
              <div className="mt-4 rounded-2xl bg-[#f8ead7] p-4">
                <h3 className="text-lg font-bold">Phòng {selectedNoteRoom.room_code || "-"}</h3>
                <p className="mt-1 text-sm text-[#80634a]">{selectedNoteRoom.room_type || "Chưa cập nhật loại phòng"}</p>
                <textarea
                  autoFocus
                  value={notes[selectedNoteRoom.id] ?? ""}
                  onChange={(event) => setNotes((current) => ({ ...current, [selectedNoteRoom.id]: event.target.value }))}
                  rows={5}
                  maxLength={5000}
                  placeholder="Nhập ghi chú riêng cho Sale..."
                  className="mt-4 w-full resize-y rounded-xl border border-[#aa825d]/30 bg-white p-3 text-sm outline-none focus:border-[#744722] focus:ring-2 focus:ring-[#aa825d]/20"
                />
                <button type="button" onClick={() => void saveNote(selectedNoteRoom.id)} disabled={busy === selectedNoteRoom.id} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#744722] text-sm font-semibold text-white disabled:opacity-50">{busy === selectedNoteRoom.id ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}Lưu ghi chú</button>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="min-w-0 text-xl font-bold">Phòng trong tòa nhà</h2>
                  <button type="button" onClick={() => setNoteRoomsOpen(false)} className="shrink-0 rounded-lg p-1.5 text-[#684324] hover:bg-[#f8ead7]" aria-label="Đóng"><X size={20} /></button>
                </div>
                <p className="mt-1 text-sm text-[#80634a]">Chọn một phòng để thêm ghi chú riêng cho Sale.</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-[#80634a]"><NoteLegend color="bg-[#2f9e62]" label="Đang trống" /><NoteLegend color="bg-[#cf5252]" label="Đã thuê" /><NoteLegend color="bg-[#d99a35]" label="Sắp trống" /></div>
              {rooms.length ? <PropertyRoomCardGrid rooms={rooms} onRoomClick={(room) => setSelectedNoteRoomId(room.id)} /> : <div className="mt-5 rounded-2xl border border-dashed border-[#a9825f]/35 p-6 text-sm text-[#80634a]">Chưa có phòng trong tòa nhà này.</div>}
            </>
          )}
        </div>
      </div>
    ) : null}
  </>;
}

function NoteLegend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}</span>;
}

function DocumentChoices({ title, documents, selected, onChange }: { title: string; documents: PropertyDocument[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return <fieldset className="mt-3 min-w-0 max-w-full rounded-xl border border-[#a9825f]/20 bg-white/60 p-3"><legend className="max-w-full break-words px-1 text-xs font-bold text-[#684324]">{title}</legend>{documents.length ? <div className="mt-1 min-w-0 max-h-40 space-y-1 overflow-y-auto">{documents.map((document) => <label key={document.id} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-[#f8ead7]"><input type="checkbox" checked={selected.includes(document.id)} onChange={(event) => onChange(event.target.checked ? [...selected, document.id] : selected.filter((id) => id !== document.id))} className="h-4 w-4 shrink-0 accent-[#744722]" /><span className="min-w-0 flex-1 truncate text-xs font-semibold">{document.title}</span></label>)}</div> : <p className="break-words py-2 text-xs text-[#80634a]">Kho tài liệu tòa nhà đang trống.</p>}</fieldset>;
}

function onlineDocumentTitle(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "docs.google.com") {
    if (url.pathname.includes("/spreadsheets/")) return "Google Sheets";
    if (url.pathname.includes("/document/")) return "Google Docs";
    if (url.pathname.includes("/presentation/")) return "Google Slides";
    if (url.pathname.includes("/forms/")) return "Google Forms";
  }
  if (host === "drive.google.com") return "Google Drive";
  if (host.includes("onedrive") || host.includes("sharepoint")) return "Microsoft OneDrive";
  if (host === "dropbox.com") return "Dropbox";
  if (host === "notion.so" || host.endsWith(".notion.site")) return "Notion";
  return `Tài liệu trực tuyến · ${host}`;
}

function withShareVersion(url: string) {
  const parsed = new URL(url);
  parsed.searchParams.set("share", Date.now().toString(36));
  return parsed.toString();
}
