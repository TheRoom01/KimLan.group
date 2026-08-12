"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, FilePlus2, Link2, Loader2, RefreshCw, Trash2 } from "lucide-react";

import { readApiResponse } from "@/lib/api/client";

type PortalLink = { id: string; label: string; expires_at: string | null; revoked_at: string | null; last_accessed_at: string | null; created_at: string };
type Document = { id: string; title: string; description: string | null; file_name: string; file_url: string; file_path: string | null; mime_type: string | null; size_bytes: number | null };
type Room = { id: string; room_code?: string | null; room_type?: string | null };

export default function SalesPortalManager({ propertyId, rooms, initialNotes }: { propertyId: string; rooms: Room[]; initialNotes: Record<string, string> }) {
  const [links, setLinks] = useState<PortalLink[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [notes, setNotes] = useState(initialNotes);
  const [label, setLabel] = useState("Link đội Sale");
  const [expiresAt, setExpiresAt] = useState("");
  const [latestUrl, setLatestUrl] = useState<string | null>(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentDescription, setDocumentDescription] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { void load(); }, [propertyId]);

  async function load() {
    try {
      const [linkRows, documentRows] = await Promise.all([
        readApiResponse<PortalLink[]>(await fetch(`/api/owner/properties/${propertyId}/sales-portal`, { cache: "no-store" })),
        readApiResponse<Document[]>(await fetch(`/api/owner/properties/${propertyId}/sales-documents`, { cache: "no-store" })),
      ]);
      setLinks(linkRows); setDocuments(documentRows);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể tải Sales Portal"); }
  }

  async function createLink() {
    setBusy("link"); setMessage(null);
    try {
      const result = await readApiResponse<{ path: string }>(await fetch(`/api/owner/properties/${propertyId}/sales-portal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, expires_at: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null }) }));
      const url = `${window.location.origin}${result.path}`;
      setLatestUrl(url); await navigator.clipboard.writeText(url).catch(() => undefined);
      setMessage("Đã tạo và sao chép link Sales Portal."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể tạo link"); } finally { setBusy(null); }
  }

  async function revokeLink(id: string) {
    setBusy(id); setMessage(null);
    try { await readApiResponse(await fetch(`/api/owner/properties/${propertyId}/sales-portal/${id}`, { method: "DELETE" })); if (latestUrl) setLatestUrl(null); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không thể thu hồi link"); } finally { setBusy(null); }
  }

  async function uploadDocument() {
    const sharedUrl = documentUrl.trim();
    if (!documentTitle.trim() || (!file && !sharedUrl)) { setMessage("Vui lòng nhập tên và chọn tệp hoặc dán link tài liệu."); return; }
    setBusy("document"); setMessage(null);
    try {
      let payload: { file_name: string; file_url: string; file_path: string | null; mime_type: string | null; size_bytes: number | null };
      if (file) {
        const presignResponse = await fetch("/api/upload/r2-presign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ property_id: propertyId, sales_document: true, file_name: file.name, content_type: file.type || "application/octet-stream", size: file.size }) });
        const presign = await presignResponse.json() as { uploadUrl?: string; publicUrl?: string; key?: string; requiredHeaders?: Record<string, string>; error?: string };
        if (!presignResponse.ok || !presign.uploadUrl || !presign.publicUrl || !presign.key) throw new Error(presign.error || "Không thể chuẩn bị upload tài liệu");
        const uploaded = await fetch(presign.uploadUrl, { method: "PUT", headers: presign.requiredHeaders, body: file });
        if (!uploaded.ok) throw new Error("Không thể tải tài liệu lên kho lưu trữ");
        payload = { file_name: file.name, file_url: presign.publicUrl, file_path: presign.key, mime_type: file.type || null, size_bytes: file.size };
      } else {
        let parsedUrl: URL;
        try { parsedUrl = new URL(sharedUrl); } catch { throw new Error("Link tài liệu không hợp lệ"); }
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error("Link tài liệu phải bắt đầu bằng http:// hoặc https://");
        payload = { file_name: parsedUrl.hostname, file_url: parsedUrl.toString(), file_path: null, mime_type: null, size_bytes: null };
      }
      await readApiResponse(await fetch(`/api/owner/properties/${propertyId}/sales-documents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: documentTitle, description: documentDescription, ...payload }) }));
      setDocumentTitle(""); setDocumentDescription(""); setDocumentUrl(""); setFile(null); setMessage("Đã lưu tài liệu cho Sale."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể thêm tài liệu"); } finally { setBusy(null); }
  }

  async function deleteDocument(id: string) {
    setBusy(id);
    try { await readApiResponse(await fetch(`/api/owner/properties/${propertyId}/sales-documents/${id}`, { method: "DELETE" })); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không thể xóa tài liệu"); } finally { setBusy(null); }
  }

  async function saveNote(roomId: string) {
    setBusy(roomId); setMessage(null);
    try { await readApiResponse(await fetch(`/api/owner/rooms/${roomId}/sales-note`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: notes[roomId] ?? "" }) })); setMessage("Đã lưu ghi chú cho Sale."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không thể lưu ghi chú"); } finally { setBusy(null); }
  }

  return (
    <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-5 shadow-[0_10px_25px_rgba(92,61,34,0.06)] sm:p-6">
      <div className="flex items-center gap-2"><Link2 size={21} className="text-[#744722]" /><div><h2 className="text-xl font-bold">Chia sẻ Thông tin tòa nhà (cho Sale)</h2><p className="mt-1 text-sm text-[#80634a]">Người mở link này sẽ xem được Thông tin và Tình trạng phòng mới nhất.</p></div></div>
      {message ? <div className="mt-4 rounded-xl border border-[#d9bd99] bg-[#f8ead7] px-4 py-3 text-sm text-[#684324]">{message}</div> : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-[#a9825f]/20 p-4"><h3 className="font-bold">① Link truy cập</h3><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_170px_auto]"><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ví dụ: Đội Sale Quận 3" className="h-11 rounded-xl border border-[#aa825d]/30 bg-white px-3" /><input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="h-11 rounded-xl border border-[#aa825d]/30 bg-white px-3" /><button type="button" onClick={() => void createLink()} disabled={busy === "link"} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#744722] px-4 font-semibold text-white disabled:opacity-50">{busy === "link" ? <Loader2 className="animate-spin" size={17} /> : <Link2 size={17} />}Tạo link</button></div>{latestUrl ? <div className="mt-3 flex min-w-0 items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><Check size={16} /><span className="min-w-0 flex-1 truncate">{latestUrl}</span><button type="button" onClick={() => void navigator.clipboard.writeText(latestUrl)} aria-label="Sao chép"><Copy size={16} /></button><a href={latestUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /></a></div> : null}<div className="mt-4 space-y-2">{links.map((link) => <div key={link.id} className="flex items-center gap-3 rounded-xl bg-[#f8ead7] p-3 text-sm"><span className="min-w-0 flex-1"><strong className="block truncate">{link.label}</strong><span className="text-xs text-[#80634a]">{link.revoked_at ? "Đã thu hồi" : link.expires_at ? `Hết hạn ${new Date(link.expires_at).toLocaleDateString("vi-VN")}` : "Không hết hạn"}{link.last_accessed_at ? ` · Truy cập ${new Date(link.last_accessed_at).toLocaleString("vi-VN")}` : ""}</span></span>{!link.revoked_at ? <button type="button" onClick={() => void revokeLink(link.id)} disabled={busy === link.id} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={17} /></button> : null}</div>)}</div></div>

        <div className="rounded-2xl border border-[#a9825f]/20 p-4"><h3 className="font-bold">② Tài liệu cho Sale</h3><div className="mt-3 space-y-3"><input value={documentTitle} onChange={(e) => setDocumentTitle(e.target.value)} placeholder="Tên tài liệu" className="h-11 w-full rounded-xl border border-[#aa825d]/30 bg-white px-3" /><textarea value={documentDescription} onChange={(e) => setDocumentDescription(e.target.value)} placeholder="Mô tả ngắn (không bắt buộc)" rows={2} className="w-full rounded-xl border border-[#aa825d]/30 bg-white p-3" /><div className="grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)]"><label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#8f633e] bg-[#fffaf2] px-3 text-sm font-semibold text-[#744722] transition hover:bg-[#f8ead7]" title={file?.name || "Chọn tệp từ thiết bị"}><FilePlus2 size={17} />Chọn tệp<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*" onChange={(e) => { setFile(e.target.files?.[0] ?? null); if (e.target.files?.[0]) setDocumentUrl(""); }} className="sr-only" /></label><input type="url" value={documentUrl} onChange={(e) => { setDocumentUrl(e.target.value); if (e.target.value) setFile(null); }} placeholder="Dán link Google Trang tính, Docs hoặc link bất kỳ" className="h-11 min-w-0 rounded-xl border border-[#aa825d]/30 bg-white px-3" /></div><button type="button" onClick={() => void uploadDocument()} disabled={busy === "document"} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#744722] font-semibold text-white disabled:opacity-50">{busy === "document" ? <Loader2 className="animate-spin" size={17} /> : <FilePlus2 size={17} />}Lưu tài liệu</button></div><div className="mt-4 space-y-2">{documents.map((document) => <div key={document.id} className="flex items-center gap-3 rounded-xl bg-[#f8ead7] p-3 text-sm"><a href={document.file_url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 hover:underline"><strong className="block truncate">{document.title}</strong><span className="block truncate text-xs text-[#80634a]">{document.file_name}</span></a><button type="button" onClick={() => void deleteDocument(document.id)} disabled={busy === document.id} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={17} /></button></div>)}</div></div>
      </div>

      <div className="mt-5 rounded-2xl border border-[#a9825f]/20 p-4"><h3 className="font-bold">③ Ghi chú riêng cho Sale theo phòng</h3><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rooms.map((room) => <div key={room.id} className="rounded-2xl bg-[#f8ead7] p-3"><p className="font-bold">Phòng {room.room_code || "-"}</p><p className="text-xs text-[#80634a]">{room.room_type || "Chưa cập nhật loại phòng"}</p><textarea value={notes[room.id] ?? ""} onChange={(e) => setNotes((current) => ({ ...current, [room.id]: e.target.value }))} rows={3} placeholder="Ví dụ: ưu tiên khách vào ngay, hoa hồng..." className="mt-3 w-full rounded-xl border border-[#aa825d]/30 bg-white p-3 text-sm" /><button type="button" onClick={() => void saveNote(room.id)} disabled={busy === room.id} className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-[#744722] text-sm font-semibold text-white disabled:opacity-50">{busy === room.id ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}Lưu ghi chú</button></div>)}</div></div>
    </section>
  );
}
