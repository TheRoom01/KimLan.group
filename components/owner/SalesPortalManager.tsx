"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, FilePlus2, FileText, Link2, Loader2, RefreshCw, Save, Trash2 } from "lucide-react";

import { readApiResponse } from "@/lib/api/client";

type PortalLink = { id: string; label: string; public_token: string | null; expires_at: string | null; revoked_at: string | null; last_accessed_at: string | null; created_at: string; document_ids: string[] };
type PropertyDocument = { id: string; title: string; description: string | null; file_name: string; file_url: string; file_path: string | null; mime_type: string | null; size_bytes: number | null };
type Room = { id: string; room_code?: string | null; room_type?: string | null };

export default function SalesPortalManager({ propertyId, rooms, initialNotes }: { propertyId: string; rooms: Room[]; initialNotes: Record<string, string> }) {
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
    try { await readApiResponse(await fetch(`/api/owner/rooms/${roomId}/sales-note`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: notes[roomId] ?? "" }) })); setMessage("Đã lưu ghi chú cho Sale."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không thể lưu ghi chú"); } finally { setBusy(null); }
  }

  return <section className="min-w-0 max-w-full overflow-hidden rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_10px_25px_rgba(92,61,34,0.06)] [overflow-wrap:anywhere] [&_input]:max-w-full [&_input]:min-w-0 [&_textarea]:max-w-full [&_textarea]:min-w-0 sm:p-6">
    <div className="flex min-w-0 items-start gap-2"><Link2 size={21} className="mt-0.5 shrink-0 text-[#744722]" /><div className="min-w-0"><h2 className="break-words text-lg font-bold sm:text-xl">Chia sẻ thông tin tòa nhà (cho Sale)</h2><p className="mt-1 break-words text-sm text-[#80634a]">Mỗi link Sale có thể chia sẻ một bộ tài liệu riêng từ kho tài liệu tòa nhà.</p></div></div>
    {message ? <div className="mt-4 rounded-xl border border-[#d9bd99] bg-[#f8ead7] px-4 py-3 text-sm text-[#684324]">{message}</div> : null}

    <div className="mt-5 grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-2">
      <div className="min-w-0 max-w-full rounded-2xl border border-[#a9825f]/20 p-3 sm:p-4">
        <h3 className="font-bold">① Link truy cập</h3>
        <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[minmax(0,1fr)_170px]"><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ví dụ: Đội Sale Quận 3" className="h-11 w-full min-w-0 rounded-xl border border-[#aa825d]/30 bg-white px-3" /><input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="h-11 w-full min-w-0 max-w-full rounded-xl border border-[#aa825d]/30 bg-white px-3" /></div>
        <DocumentChoices title="Tài liệu chia sẻ trong link mới" documents={documents} selected={newLinkDocumentIds} onChange={setNewLinkDocumentIds} />
        <button type="button" onClick={() => void createLink()} disabled={busy === "link"} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#744722] px-4 font-semibold text-white disabled:opacity-50">{busy === "link" ? <Loader2 className="animate-spin" size={17} /> : <Link2 size={17} />}Tạo link</button>
        {latestUrl ? <div className="mt-3 flex min-w-0 items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><Check size={16} /><span className="min-w-0 flex-1 truncate">{latestUrl}</span><button onClick={() => void navigator.clipboard.writeText(latestUrl)} aria-label="Sao chép"><Copy size={16} /></button><a href={latestUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /></a></div> : null}
        <div className="mt-4 space-y-3">{links.map((link) => <div key={link.id} className="rounded-xl bg-[#f8ead7] p-3 text-sm"><div className="flex items-center gap-2"><span className="min-w-0 flex-1"><strong className="block truncate">{link.label}</strong><span className="text-xs text-[#80634a]">{link.revoked_at ? "Đã thu hồi" : `${link.document_ids.length} tài liệu · ${link.expires_at ? `Hết hạn ${new Date(link.expires_at).toLocaleDateString("vi-VN")}` : "Không hết hạn"}`}</span></span>{!link.revoked_at ? <><button onClick={() => void copyPortalLink(link)} className="rounded-lg p-2 text-[#744722] hover:bg-white/70">{copiedLinkId === link.id ? <Check size={17} /> : <Copy size={17} />}</button><button onClick={() => void revokeLink(link.id)} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={17} /></button></> : null}</div>{!link.revoked_at ? <><DocumentChoices title="Tài liệu riêng của link này" documents={documents} selected={linkSelections[link.id] ?? []} onChange={(ids) => setLinkSelections((current) => ({ ...current, [link.id]: ids }))} /><button type="button" onClick={() => void saveLinkDocuments(link.id)} disabled={busy === `selection-${link.id}`} className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-[#8f633e]/30 bg-white text-xs font-bold text-[#744722] disabled:opacity-50">{busy === `selection-${link.id}` ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}Lưu bộ tài liệu cho link</button></> : null}</div>)}</div>
      </div>

      <div className="rounded-2xl border border-[#a9825f]/20 p-4"><h3 className="font-bold">② Kho tài liệu tòa nhà</h3><p className="mt-1 text-xs text-[#80634a]">Upload một lần, sau đó chọn tài liệu cần chia sẻ cho từng link Sale.</p><div className="mt-3 space-y-3"><input value={documentTitle} onChange={(e) => setDocumentTitle(e.target.value)} placeholder="Tên tài liệu" className="h-11 w-full rounded-xl border border-[#aa825d]/30 bg-white px-3" /><textarea value={documentDescription} onChange={(e) => setDocumentDescription(e.target.value)} placeholder="Mô tả ngắn (không bắt buộc)" rows={2} className="w-full rounded-xl border border-[#aa825d]/30 bg-white p-3" /><div className="grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)]"><label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#8f633e] bg-[#fffaf2] px-3 text-sm font-semibold text-[#744722]"><FilePlus2 size={17} />{file?.name ? "Đã chọn tệp" : "Chọn tệp"}<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*" onChange={(e) => { setFile(e.target.files?.[0] ?? null); if (e.target.files?.[0]) setDocumentUrl(""); }} className="sr-only" /></label><input type="url" value={documentUrl} onChange={(e) => { setDocumentUrl(e.target.value); if (e.target.value) setFile(null); }} placeholder="Dán link Docs, Excel hoặc link bất kỳ" className="h-11 min-w-0 rounded-xl border border-[#aa825d]/30 bg-white px-3" /></div><button type="button" onClick={() => void uploadDocument()} disabled={busy === "document"} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#744722] font-semibold text-white disabled:opacity-50">{busy === "document" ? <Loader2 className="animate-spin" size={17} /> : <FilePlus2 size={17} />}Lưu vào kho tài liệu tòa nhà</button></div><div className="mt-4 space-y-2">{documents.map((document) => <div key={document.id} className="flex items-center gap-3 rounded-xl bg-[#f8ead7] p-3 text-sm"><FileText size={17} className="shrink-0 text-[#744722]" /><a href={document.file_url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 hover:underline"><strong className="block truncate">{document.title}</strong><span className="block truncate text-xs text-[#80634a]">{document.file_name}</span></a><button onClick={() => void deleteDocument(document.id)} disabled={busy === document.id} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={17} /></button></div>)}</div></div>
    </div>

    <div className="mt-5 rounded-2xl border border-[#a9825f]/20 p-4"><h3 className="font-bold">③ Ghi chú riêng cho Sale theo phòng</h3><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rooms.map((room) => <div key={room.id} className="rounded-2xl bg-[#f8ead7] p-3"><p className="font-bold">Phòng {room.room_code || "-"}</p><p className="text-xs text-[#80634a]">{room.room_type || "Chưa cập nhật loại phòng"}</p><textarea value={notes[room.id] ?? ""} onChange={(e) => setNotes((current) => ({ ...current, [room.id]: e.target.value }))} rows={3} className="mt-3 w-full rounded-xl border border-[#aa825d]/30 bg-white p-3 text-sm" /><button onClick={() => void saveNote(room.id)} disabled={busy === room.id} className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-[#744722] text-sm font-semibold text-white disabled:opacity-50">{busy === room.id ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}Lưu ghi chú</button></div>)}</div></div>
  </section>;
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
