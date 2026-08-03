"use client";

import { ImageIcon, Loader2, Trash2, Upload, X } from "lucide-react";
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { readApiResponse } from "@/lib/api/client";
import { mapWithConcurrency, prepareImagesForUpload, resolveUploadContentType } from "@/lib/media/uploadFileType";

type Media = { key: string; url: string; size: number; updated_at?: string | null };
type Presign = { key: string; uploadUrl: string; requiredHeaders: Record<string, string> };
type PendingImage = { file: File; preview: string };
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 30;

export default function ContractImagesManager({ contractId }: { contractId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<PendingImage[]>([]);
  const [items, setItems] = useState<Media[]>([]);
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Media | null>(null);

  async function load() {
    setLoading(true);
    try {
      setItems(await readApiResponse<Media[]>(await fetch(`/api/owner/contracts/${contractId}/media`, { cache: "no-store" })));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải ảnh hợp đồng");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [contractId]);
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  useEffect(() => () => pendingRef.current.forEach((item) => URL.revokeObjectURL(item.preview)), []);
  useEffect(() => {
    if (!viewing) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setViewing(null); };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", close);
    };
  }, [viewing]);

  function closeModal() {
    if (uploading) return;
    pending.forEach((item) => URL.revokeObjectURL(item.preview));
    setPending([]); setModalError(null); setDragging(false); setOpen(false);
    if (input.current) input.current.value = "";
  }

  async function choose(filesLike: FileList | File[]) {
    const selected = Array.from(filesLike);
    setDragging(false); setModalError(null);
    if (!selected.length) return;
    let files: File[];
    try {
      files = await prepareImagesForUpload(selected);
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Không thể xử lý ảnh từ điện thoại.");
      return;
    }
    if (items.length + pending.length + files.length > MAX_FILES) return setModalError(`Mỗi hợp đồng tối đa ${MAX_FILES} ảnh.`);
    const invalid = files.find((file) => !resolveUploadContentType(file).startsWith("image/") || file.size > MAX_BYTES);
    if (invalid) return setModalError(`Ảnh ${invalid.name} không hợp lệ hoặc vượt quá 15 MB.`);
    setPending((current) => [...current, ...files.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    if (input.current) input.current.value = "";
  }

  function removePending(index: number) {
    setPending((current) => {
      URL.revokeObjectURL(current[index].preview);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  async function save() {
    if (!pending.length) return setModalError("Hãy chọn ít nhất một ảnh hợp đồng.");
    setUploading(true); setModalError(null);
    try {
      const prepared = await mapWithConcurrency(pending, 4, async ({ file }) => ({
        file,
        presign: await readApiResponse<Presign>(await fetch(`/api/owner/contracts/${contractId}/media`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_name: file.name, content_type: resolveUploadContentType(file), size: file.size }),
        })),
      }));
      await mapWithConcurrency(prepared, 3, async ({ file, presign }) => {
        const uploaded = await fetch(presign.uploadUrl, { method: "PUT", headers: presign.requiredHeaders, body: file });
        if (!uploaded.ok) throw new Error(`Không thể upload ${file.name}`);
      });
      const count = pending.length;
      pending.forEach((item) => URL.revokeObjectURL(item.preview));
      setPending([]); setOpen(false); setMessage(`Đã tải lên ${count} ảnh hợp đồng.`);
      await load();
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Upload ảnh hợp đồng thất bại");
    } finally { setUploading(false); }
  }

  async function remove(item: Media) {
    setDeleting(item.key); setMessage(null);
    try {
      await readApiResponse(await fetch(`/api/owner/contracts/${contractId}/media?key=${encodeURIComponent(item.key)}`, { method: "DELETE" }));
      setItems((current) => current.filter((candidate) => candidate.key !== item.key));
      setMessage("Đã xóa ảnh hợp đồng.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xóa ảnh hợp đồng");
    } finally { setDeleting(null); }
  }

  return <>
    <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:p-6">
      <div className="mb-4 flex items-center gap-2"><ImageIcon size={19} className="text-[#744722]" /><h2 className="text-lg font-bold text-[#4f321e]">Hình ảnh hợp đồng</h2></div>
      {loading ? <div className="flex items-center gap-2 text-sm text-[#80634a]"><Loader2 size={16} className="animate-spin" /> Đang tải thư viện ảnh...</div> : null}
      {!loading && items.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{items.map((item, index) => <article key={item.key} className="group relative overflow-hidden rounded-xl border border-[#aa825d]/25 bg-white"><button type="button" onClick={() => setViewing(item)} className="block w-full cursor-zoom-in"><img src={item.url} alt={`Hợp đồng ${index + 1}`} className="h-44 w-full object-contain p-2" /></button><button type="button" disabled={deleting === item.key} onClick={() => void remove(item)} className="absolute right-2 top-2 rounded-full bg-white/95 p-2 text-red-700 shadow-md disabled:opacity-50" aria-label="Xóa ảnh">{deleting === item.key ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}</button></article>)}</div> : null}
      {!loading && !items.length ? <div className="grid min-h-28 place-items-center rounded-2xl border border-dashed border-[#aa825d]/30 bg-[#f8ead7]/60 text-center text-sm text-[#80634a]"><span><ImageIcon className="mx-auto mb-2" size={22} />Chưa có ảnh hợp đồng</span></div> : null}
      {message ? <p className="mt-3 rounded-xl bg-[#f8ead7] px-3 py-2 text-sm text-[#684324]">{message}</p> : null}
      <button type="button" onClick={() => { setModalError(null); setOpen(true); }} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-[#744722] px-5 text-sm font-bold text-white transition hover:bg-[#623817]"><Upload size={17} /> Tải HĐ lên</button>
    </section>

    {open ? <div className="fixed inset-0 z-[10000] grid place-items-center bg-black/55 p-3 backdrop-blur-sm" onMouseDown={closeModal}>
      <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[24px] bg-[#fff9ef] p-4 shadow-2xl sm:p-6" onMouseDown={(event) => event.stopPropagation()}>
        <header className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold text-[#432918]">Tải hình ảnh hợp đồng</h2><p className="mt-1 text-sm text-[#80634a]">Chọn ảnh và kiểm tra preview trước khi lưu.</p></div><button type="button" disabled={uploading} onClick={closeModal} className="rounded-full p-2 text-[#684324] hover:bg-[#f3e1c9]" aria-label="Đóng"><X size={20} /></button></header>
        <button type="button" disabled={uploading} onClick={() => input.current?.click()}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
          onDrop={(event: DragEvent<HTMLButtonElement>) => { event.preventDefault(); void choose(event.dataTransfer.files); }}
          className={`grid min-h-40 w-full place-items-center rounded-2xl border-2 border-dashed px-5 py-6 text-center transition ${dragging ? "border-[#744722] bg-[#f2ddbf]" : "border-[#aa825d]/40 bg-[#f8ead7] hover:border-[#744722]"} disabled:opacity-60`}>
          <input ref={input} type="file" accept="image/*,.heic,.heif" multiple className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => { const selected = event.target.files; event.target.value = ""; if (selected) void choose(selected); }} />
          <span className="text-sm font-semibold text-[#684324]"><Upload className="mx-auto mb-2" size={27} />Kéo thả ảnh hợp đồng vào đây<br/><small className="font-normal text-[#8a6b50]">hoặc bấm để chọn file · tối đa 15 MB/ảnh</small></span>
        </button>
        {pending.length ? <div className="mt-4"><p className="mb-2 text-sm font-semibold text-[#5a3b25]">Ảnh chờ lưu ({pending.length})</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{pending.map((item, index) => <article key={`${item.file.name}-${item.file.lastModified}-${index}`} className="relative overflow-hidden rounded-xl border border-[#aa825d]/25 bg-white"><img src={item.preview} alt={item.file.name} className="h-36 w-full object-contain p-2"/><button type="button" disabled={uploading} onClick={() => removePending(index)} className="absolute right-2 top-2 rounded-full bg-white/95 p-2 text-red-700 shadow" aria-label="Bỏ ảnh"><Trash2 size={15}/></button><p className="truncate border-t px-2 py-1.5 text-[11px] text-[#80634a]">{item.file.name}</p></article>)}</div></div> : null}
        {modalError ? <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{modalError}</p> : null}
        <footer className="mt-5 flex justify-end gap-2 border-t border-[#aa825d]/20 pt-4"><button type="button" disabled={uploading} onClick={closeModal} className="rounded-xl border border-[#9a704b]/30 px-4 py-2.5 text-sm font-semibold text-[#684324]">Hủy</button><button type="button" disabled={uploading || !pending.length} onClick={() => void save()} className="inline-flex min-w-28 items-center justify-center gap-2 rounded-xl bg-[#744722] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{uploading ? <><Loader2 size={16} className="animate-spin"/>Đang lưu...</> : "Lưu"}</button></footer>
      </section>
    </div> : null}

    {viewing ? <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/90 p-3 sm:p-6" onMouseDown={() => setViewing(null)} role="dialog" aria-modal="true" aria-label="Xem ảnh hợp đồng toàn màn hình">
      <button type="button" onClick={() => setViewing(null)} className="absolute right-4 top-4 z-10 rounded-full bg-white/15 p-2.5 text-white backdrop-blur transition hover:bg-white/25" aria-label="Đóng ảnh"><X size={24}/></button>
      <img src={viewing.url} alt="Ảnh hợp đồng toàn màn hình" onMouseDown={(event) => event.stopPropagation()} className="max-h-full max-w-full select-none object-contain shadow-2xl" />
    </div> : null}
  </>;
}
