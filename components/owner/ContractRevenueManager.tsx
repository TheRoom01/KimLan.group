"use client";

import { CheckCircle2, Download, FileOutput, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { readApiResponse } from "@/lib/api/client";
import MoneyInput from "@/components/owner/MoneyInput";

type Month = { month: number; year: number };
type Payment = { id: string; amount: number; paid_at: string; payment_method: string };
type Rev = {
  id?: string;
  cycle_id?: string;
  room_code: string;
  tenant_name: string;
  deposit_amount: number;
  rent_amount: number;
  electricity_start: number;
  electricity_end: number;
  electricity_unit_price: number;
  parking_fee: number;
  service_fee: number;
  water_fee: number;
  other_fee: number;
  paid_amount: number;
  payment_status: "pending" | "partial" | "paid";
  note: string;
  room_revenue_cycles?: Month | Month[] | null;
};
type Contract = {
  id: string;
  start_date?: string | null;
  end_date?: string | null;
  monthly_price?: number | null;
  deposit_amount?: number | null;
  room?: {
    room_code?: string | null;
    room_details?: RoomDefaultFees | RoomDefaultFees[] | null;
  } | null;
  tenant?: { full_name?: string | null } | null;
  property?: {
    house_number?: string | null;
    address?: string | null;
    ward?: string | null;
    district?: string | null;
    city?: string | null;
  } | null;
};
type InvoiceDraft = Rev & { address: string; issue_date: string };
type RoomDefaultFees = {
  electric_fee_value?: number | null;
  water_fee_value?: number | null;
  service_fee_value?: number | null;
  parking_fee_value?: number | null;
  other_fee_value?: number | null;
};

export default function ContractRevenueManager({ contract }: { contract: Contract }) {
  const months = useMemo(
    () => monthList(contract.start_date, contract.end_date),
    [contract.start_date, contract.end_date],
  );
  const [selected, setSelected] = useState<Month | null>(months[0] ?? null);
  const [records, setRecords] = useState<Rev[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Rev>>({});
  const [form, setForm] = useState<Rev>(() => empty(contract));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [history, setHistory] = useState<Payment[]>([]);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceDraft | null>(null);
  const [invoiceExported, setInvoiceExported] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setDrafts({});
    void load();
    // load is intentionally scoped to the current contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract.id]);

  useEffect(() => {
    if (!selected) return;
    const saved = records.find((record) => {
      const currentCycle = cycle(record);
      return currentCycle?.month === selected.month && currentCycle?.year === selected.year;
    });
    setForm(normalize(saved ?? drafts[key(selected)] ?? empty(contract), contract));
  }, [selected, records, drafts, contract]);

  async function load() {
    setLoading(true);
    try {
      const rows = await readApiResponse<Rev[]>(
        await fetch(`/api/owner/revenues?contract_id=${contract.id}`, { cache: "no-store" }),
      );
      setRecords(rows.map((record) => normalize(record, contract)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không thể tải doanh thu");
    } finally {
      setLoading(false);
    }
  }

  function change(field: keyof Rev, value: string) {
    setForm((current) => {
      const next = normalize(
        { ...current, [field]: field === "note" ? value : Number(value || 0) },
        contract,
      );
      if (selected) setDrafts((currentDrafts) => ({ ...currentDrafts, [key(selected)]: next }));
      return next;
    });
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await readApiResponse(
        await fetch("/api/owner/revenues", {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            revenue_id: form.id,
            contract_id: contract.id,
            month: selected.month,
            year: selected.year,
          }),
        }),
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[key(selected)];
        return next;
      });
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Không thể lưu doanh thu");
    } finally {
      setSaving(false);
    }
  }

  async function openDetail() {
    setDetailOpen(true);
    if (!form.id) {
      setHistory([]);
      return;
    }
    try {
      setHistory(
        await readApiResponse<Payment[]>(
          await fetch(`/api/owner/revenues/${form.id}/payments`),
        ),
      );
    } catch {
      setHistory([]);
    }
  }

  async function pay() {
    if (!form.id) return;
    const raw = window.prompt(
      "Nhập số tiền đã thu",
      String(Math.max(0, total(form) - form.paid_amount)),
    );
    if (!raw) return;
    setSaving(true);
    try {
      await readApiResponse(
        await fetch(`/api/owner/revenues/${form.id}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: Number(raw), payment_method: "cash" }),
        }),
      );
      await load();
      await openDetail();
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Không thể ghi nhận thanh toán",
      );
    } finally {
      setSaving(false);
    }
  }

  function openInvoice() {
    setInvoice({
      ...form,
      address: propertyAddress(contract.property),
      issue_date: localDateInput(new Date()),
    });
    setInvoiceExported(false);
    setInvoiceOpen(true);
  }

  function confirmInvoice() {
    setInvoiceExported(true);
    setToast("Xuất phiếu thu thành công");
    window.setTimeout(() => setToast(null), 3000);
  }

  const electricity = electricityAmount(form);
  const amount = total(form);
  const missing = Math.max(0, amount - form.paid_amount);
  const selectedKey = selected ? key(selected) : "none";

  return (
    <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:p-6">
      <h2 className="text-lg font-bold text-[#432918]">Doanh thu hàng tháng</h2>
      <p className="mt-1 text-xs text-[#80634a]">
        Tổng doanh thu = Giá thuê + Tiền điện + Gửi xe + Phí DV + Nước + Phí khác.
      </p>

      <div className="mt-4 flex gap-2 overflow-x-auto">
        {months.map((month) => (
          <button
            key={key(month)}
            onClick={() => setSelected(month)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${
              selectedKey === key(month)
                ? "bg-[#744722] text-white"
                : "bg-[#eadbc8] text-[#684324]"
            }`}
          >
            Tháng {month.month}/{month.year}
          </button>
        ))}
      </div>

      {loading ? (
        <Loader2 className="mx-auto my-10 animate-spin" />
      ) : (
        <div className="mt-4">
          {!form.id && selected ? (
            <p className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Tháng {selected.month}/{selected.year} chưa có dữ liệu đã lưu.
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1580px] border-collapse text-sm">
              <thead>
                <tr>
                  {[
                    "Thu tiền",
                    "Tổng doanh thu",
                    "Đã thu",
                    "Còn thiếu",
                    "Mã phòng",
                    "Người thuê",
                    "Tiền cọc",
                    "Giá thuê",
                    "Số điện đầu tháng (kWh)",
                    "Số điện cuối tháng (kWh)",
                    "Đơn giá điện",
                    "Tiền điện",
                    "Gửi xe",
                    "Phí DV",
                    "Nước",
                    "Phí khác",
                    "Ghi chú",
                  ].map((label) => (
                    <th key={label} className="whitespace-nowrap border border-[#b99370]/35 bg-[#f3e1c9] p-2">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border p-2">
                    <button
                      onClick={() => (form.id ? void pay() : void save())}
                      className={`rounded-full px-2 py-1 font-bold ${
                        form.payment_status === "paid"
                          ? "bg-green-100 text-green-800"
                          : form.payment_status === "partial"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {form.payment_status === "paid"
                        ? "Đã thu"
                        : form.payment_status === "partial"
                          ? "Thu một phần"
                          : "Chưa thu"}
                    </button>
                  </td>
                  <Read value={amount} emphasized />
                  <Read value={form.paid_amount} />
                  <Read value={missing} />
                  <Read value={form.room_code} />
                  <Read value={form.tenant_name} />
                  <InputCell value={form.deposit_amount} onChange={(value) => change("deposit_amount", value)} />
                  <InputCell value={form.rent_amount} onChange={(value) => change("rent_amount", value)} />
                  <InputCell value={form.electricity_start} onChange={(value) => change("electricity_start", value)} money={false} />
                  <InputCell value={form.electricity_end} onChange={(value) => change("electricity_end", value)} money={false} />
                  <InputCell value={form.electricity_unit_price} onChange={(value) => change("electricity_unit_price", value)} />
                  <Read value={electricity} />
                  <InputCell value={form.parking_fee} onChange={(value) => change("parking_fee", value)} />
                  <InputCell value={form.service_fee} onChange={(value) => change("service_fee", value)} />
                  <InputCell value={form.water_fee} onChange={(value) => change("water_fee", value)} />
                  <InputCell value={form.other_fee} onChange={(value) => change("other_fee", value)} />
                  <td className="border p-1">
                    <input value={form.note} onChange={(event) => change("note", event.target.value)} className="w-full min-w-40 border-0 bg-transparent p-2 outline-none focus:bg-amber-50" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              onClick={() => void openDetail()}
              className="rounded-xl border border-black bg-black px-4 py-2 font-semibold text-white transition hover:bg-[#222222]"
            >
              Chi tiết
            </button>
            <button
              onClick={openInvoice}
              disabled={!selected}
              className="inline-flex items-center gap-2 rounded-xl bg-[#2f6b32] px-4 py-2 font-semibold text-white transition hover:bg-[#255728] disabled:opacity-50"
            >
              <FileOutput size={17} /> Xuất phiếu thu
            </button>
          </div>
        </div>
      )}

      {error ? <p className="mt-3 text-red-700">{error}</p> : null}

      {detailOpen ? (
        <div className="fixed inset-0 z-[500] overflow-y-auto bg-black/55 p-2 sm:p-6">
          <div className="mx-auto min-h-full max-w-4xl rounded-2xl bg-[#fff9ef] p-3 shadow-2xl sm:min-h-0 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[#432918]">Bảng doanh thu phòng {form.room_code}</h3>
                <p className="text-xs text-[#80634a]">
                  Tháng {selected?.month}/{selected?.year}
                </p>
              </div>
              <button onClick={() => setDetailOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#f1dfc8]" aria-label="Đóng">
                <X size={20} />
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-[#a9825f]/35">
              <table className="w-full border-collapse text-sm">
                <tbody>
                  <SheetRead label="Mã phòng" value={form.room_code} />
                  <SheetRead label="Người thuê" value={form.tenant_name} />
                  <SheetInput label="Tiền cọc" value={form.deposit_amount} onChange={(value) => change("deposit_amount", value)} />
                  <SheetInput label="Giá thuê" value={form.rent_amount} onChange={(value) => change("rent_amount", value)} />
                  <SheetInput label="Số điện đầu tháng (kWh)" value={form.electricity_start} onChange={(value) => change("electricity_start", value)} money={false} />
                  <SheetInput label="Số điện cuối tháng (kWh)" value={form.electricity_end} onChange={(value) => change("electricity_end", value)} money={false} />
                  <SheetInput label="Đơn giá điện (đ/kWh)" value={form.electricity_unit_price} onChange={(value) => change("electricity_unit_price", value)} />
                  <SheetRead label="Tiền điện" value={electricity} />
                  <SheetInput label="Gửi xe" value={form.parking_fee} onChange={(value) => change("parking_fee", value)} />
                  <SheetInput label="Phí dịch vụ" value={form.service_fee} onChange={(value) => change("service_fee", value)} />
                  <SheetInput label="Nước" value={form.water_fee} onChange={(value) => change("water_fee", value)} />
                  <SheetInput label="Phí khác" value={form.other_fee} onChange={(value) => change("other_fee", value)} />
                  <SheetRead label="Tổng doanh thu" value={amount} emphasized />
                  <SheetRead label="Đã thu" value={form.paid_amount} />
                  <SheetRead label="Còn thiếu" value={missing} />
                  <tr>
                    <th className="w-[48%] border-r border-t border-[#a9825f]/30 bg-[#f3e1c9] p-3 text-left">Ghi chú</th>
                    <td className="border-t border-[#a9825f]/30 bg-white p-1">
                      <textarea value={form.note} onChange={(event) => change("note", event.target.value)} className="min-h-20 w-full resize-y p-2 outline-none" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {form.id ? <button onClick={() => void pay()} className="rounded-xl border border-[#744722]/30 bg-white px-4 py-2 font-semibold text-[#744722]">Ghi nhận thanh toán</button> : null}
              <button onClick={() => void save()} disabled={saving || !selected} className="rounded-xl bg-[#744722] px-4 py-2 font-semibold text-white disabled:opacity-50">{saving ? "Đang lưu..." : "Lưu thay đổi"}</button>
            </div>

            {history.length ? (
              <div className="mt-6">
                <h4 className="font-bold text-[#4d3422]">Lịch sử thanh toán</h4>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[480px] border-collapse text-sm">
                    <thead><tr>{["Thời gian", "Số tiền", "Phương thức"].map((label) => <th key={label} className="border bg-[#f3e1c9] p-2 text-left">{label}</th>)}</tr></thead>
                    <tbody>{history.map((payment) => <tr key={payment.id}><td className="border p-2">{new Date(payment.paid_at).toLocaleString("vi-VN")}</td><td className="border p-2 font-semibold">{money(payment.amount)}</td><td className="border p-2">{payment.payment_method}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {invoiceOpen && invoice && selected ? (
        <ReceiptEditor
          value={invoice}
          month={selected}
          exported={invoiceExported}
          onChange={(next) => {
            setInvoice(next);
            setInvoiceExported(false);
          }}
          onClose={() => setInvoiceOpen(false)}
          onConfirm={confirmInvoice}
          onDownload={() => downloadReceipt(invoice, selected)}
        />
      ) : null}

      {toast ? (
        <div role="status" className="fixed bottom-24 left-1/2 z-[700] flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-2xl">
          <CheckCircle2 size={18} /> {toast}
        </div>
      ) : null}
    </section>
  );
}

function ReceiptEditor({
  value,
  month,
  exported,
  onChange,
  onClose,
  onConfirm,
  onDownload,
}: {
  value: InvoiceDraft;
  month: Month;
  exported: boolean;
  onChange: (value: InvoiceDraft) => void;
  onClose: () => void;
  onConfirm: () => void;
  onDownload: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const update = (field: keyof InvoiceDraft, next: string | number) =>
    onChange({ ...value, [field]: next });
  const electricity = electricityAmount(value);
  const amount = total(value);

  return (
    <div onMouseDown={onClose} className="fixed inset-0 z-[600] overflow-y-auto bg-black/60 p-2 backdrop-blur-sm sm:p-6">
      <div onMouseDown={(event) => event.stopPropagation()} className="mx-auto w-full max-w-3xl rounded-[28px] bg-[#f7f3e8] p-3 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-[#244e29]">Xem trước và chỉnh phiếu thu</h3>
            <p className="mt-1 text-xs text-[#6c765e]">Dữ liệu chỉnh tại đây chỉ dùng cho phiếu thu, không làm thay đổi bảng doanh thu.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-black/5"><X size={20} /></button>
        </div>

        <div className="overflow-hidden rounded-[20px] border border-[#6a8b62]/40 bg-[#fffef8] shadow-sm">
          <header className="flex items-center justify-between gap-3 border-b border-[#91a98a]/35 p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#326b36] text-xl text-white">⌂</span>
              <div><h4 className="font-black uppercase text-[#326b36]">Phiếu thu tiền phòng trọ</h4><p className="text-xs font-bold text-[#66745d]">THÁNG {month.month}/{month.year}</p></div>
            </div>
            <label className="w-24 rounded-lg border border-[#5f8a5c] p-2 text-center text-[10px] font-bold text-[#35613a]">PHÒNG<input value={value.room_code} onChange={(event) => update("room_code", event.target.value)} className="mt-0.5 w-full bg-transparent text-center text-lg font-black outline-none" /></label>
          </header>

          <div className="grid grid-cols-[42%_58%] bg-[#dce8d5] px-3 py-2 text-xs font-black uppercase text-[#345c37]"><span>Nội dung</span><span className="text-right">Thành tiền / thông tin</span></div>
          <ReceiptTextLine label="Địa chỉ nhà" value={value.address} onChange={(next) => update("address", next)} />
          <ReceiptTextLine label="Người thuê" value={value.tenant_name} onChange={(next) => update("tenant_name", next)} />
          <ReceiptMoneyLine label="Giá thuê" value={value.rent_amount} onChange={(next) => update("rent_amount", next)} />
          <ReceiptNumberLine label="Số điện đầu tháng (kWh)" value={value.electricity_start} onChange={(next) => update("electricity_start", next)} />
          <ReceiptNumberLine label="Số điện cuối tháng (kWh)" value={value.electricity_end} onChange={(next) => update("electricity_end", next)} />
          <ReceiptMoneyLine label="Đơn giá điện (đ/kWh)" value={value.electricity_unit_price} onChange={(next) => update("electricity_unit_price", next)} />
          <ReceiptReadLine label="Tiền điện" value={money(electricity)} />
          <ReceiptMoneyLine label="Gửi xe" value={value.parking_fee} onChange={(next) => update("parking_fee", next)} />
          <ReceiptMoneyLine label="Phí dịch vụ" value={value.service_fee} onChange={(next) => update("service_fee", next)} />
          <ReceiptMoneyLine label="Nước" value={value.water_fee} onChange={(next) => update("water_fee", next)} />
          <ReceiptMoneyLine label="Phí khác" value={value.other_fee} onChange={(next) => update("other_fee", next)} />
          <div className="grid grid-cols-[58%_42%] bg-[#326b36] px-3 py-2.5 text-sm font-black text-white"><span>TỔNG TIỀN CẦN THANH TOÁN</span><span className="text-right">{money(amount)}</span></div>
          <div className="grid gap-3 p-3 sm:grid-cols-[1fr_210px]">
            <label className="text-xs font-bold text-[#4f654b]">Ghi chú<textarea value={value.note} onChange={(event) => update("note", event.target.value)} className="mt-1 min-h-20 w-full resize-y rounded-lg border border-[#b8c7b1] bg-white p-2 font-normal text-[#303b2d] outline-none focus:border-[#326b36]" /></label>
            <label className="text-xs font-bold text-[#4f654b]">Ngày xuất phiếu<input type="date" value={value.issue_date} onChange={(event) => update("issue_date", event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-[#b8c7b1] bg-white px-2 text-[#303b2d] outline-none focus:border-[#326b36]" /><span className="mt-3 block text-center text-[11px] font-normal italic">Người thu tiền<br />(Ký, ghi rõ họ tên)</span></label>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-[#7a8c74]/35 bg-white px-4 font-bold text-[#4f654b]">Hủy</button>
          <button type="button" onClick={onConfirm} className="min-h-11 rounded-xl bg-[#326b36] px-4 font-bold text-white">Xác nhận xuất phiếu thu</button>
          {exported ? <button type="button" onClick={onDownload} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#173d1f] px-4 font-bold text-white"><Download size={17} /> Tải phiếu thu PNG</button> : null}
        </div>
      </div>
    </div>
  );
}

function ReceiptTextLine({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid grid-cols-[42%_58%] border-b border-[#b8c7b1]/55 text-xs"><span className="p-2.5 font-semibold text-[#425640]">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="border-l border-[#b8c7b1]/55 bg-transparent p-2.5 text-right font-semibold outline-none focus:bg-emerald-50" /></label>;
}
function ReceiptMoneyLine({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <div className="grid grid-cols-[42%_58%] border-b border-[#b8c7b1]/55 text-xs"><span className="p-2.5 font-semibold text-[#425640]">{label}</span><MoneyInput value={value} onValueChange={onChange} className="border-l border-[#b8c7b1]/55 bg-transparent p-2.5 text-right font-semibold outline-none focus:bg-emerald-50" /></div>;
}
function ReceiptNumberLine({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="grid grid-cols-[42%_58%] border-b border-[#b8c7b1]/55 text-xs"><span className="p-2.5 font-semibold text-[#425640]">{label}</span><input type="number" min={0} step="any" value={value} onChange={(event) => onChange(Number(event.target.value || 0))} className="border-l border-[#b8c7b1]/55 bg-transparent p-2.5 text-right font-semibold outline-none focus:bg-emerald-50" /></label>;
}
function ReceiptReadLine({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[42%_58%] border-b border-[#b8c7b1]/55 text-xs"><span className="p-2.5 font-semibold text-[#425640]">{label}</span><span className="border-l border-[#b8c7b1]/55 p-2.5 text-right font-semibold">{value}</span></div>;
}

function monthList(start?: string | null, end?: string | null) {
  if (!start || !end) return [];
  const current = new Date(`${start.slice(0, 7)}-01`);
  const last = new Date(`${end.slice(0, 7)}-01`);
  const result: Month[] = [];
  while (current <= last && result.length < 240) {
    result.push({ month: current.getMonth() + 1, year: current.getFullYear() });
    current.setMonth(current.getMonth() + 1);
  }
  return result;
}

function key(month: Month) {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}

function cycle(revenue: Rev) {
  return Array.isArray(revenue.room_revenue_cycles)
    ? revenue.room_revenue_cycles[0]
    : revenue.room_revenue_cycles;
}

function empty(contract: Contract): Rev {
  const details = Array.isArray(contract.room?.room_details)
    ? contract.room.room_details[0]
    : contract.room?.room_details;

  return {
    room_code: contract.room?.room_code ?? "",
    tenant_name: contract.tenant?.full_name ?? "",
    deposit_amount: Number(contract.deposit_amount ?? 0),
    rent_amount: Number(contract.monthly_price ?? 0),
    electricity_start: 0,
    electricity_end: 0,
    electricity_unit_price: Number(details?.electric_fee_value ?? 0),
    parking_fee: Number(details?.parking_fee_value ?? 0),
    service_fee: Number(details?.service_fee_value ?? 0),
    water_fee: Number(details?.water_fee_value ?? 0),
    other_fee: Number(details?.other_fee_value ?? 0),
    paid_amount: 0,
    payment_status: "pending",
    note: "",
  };
}

function normalize(value: Partial<Rev>, contract: Contract): Rev {
  const fallback = empty(contract);
  const numberValue = (field: keyof Rev) => Number(value[field] ?? fallback[field] ?? 0);
  return {
    ...fallback,
    ...value,
    room_code: String(value.room_code ?? fallback.room_code),
    tenant_name: String(value.tenant_name ?? fallback.tenant_name),
    deposit_amount: numberValue("deposit_amount"),
    rent_amount: numberValue("rent_amount"),
    electricity_start: numberValue("electricity_start"),
    electricity_end: numberValue("electricity_end"),
    electricity_unit_price: numberValue("electricity_unit_price"),
    parking_fee: numberValue("parking_fee"),
    service_fee: numberValue("service_fee"),
    water_fee: numberValue("water_fee"),
    other_fee: numberValue("other_fee"),
    paid_amount: numberValue("paid_amount"),
    payment_status: value.payment_status ?? "pending",
    note: String(value.note ?? ""),
  };
}

function electricityAmount(revenue: Rev) {
  return Math.max(0, revenue.electricity_end - revenue.electricity_start) * revenue.electricity_unit_price;
}

function total(revenue: Rev) {
  return revenue.rent_amount + electricityAmount(revenue) + revenue.parking_fee + revenue.service_fee + revenue.water_fee + revenue.other_fee;
}

function propertyAddress(property?: Contract["property"]) {
  return [property?.house_number, property?.address, property?.ward, property?.district, property?.city]
    .filter(Boolean)
    .join(", ");
}

function downloadReceipt(invoice: InvoiceDraft, month: Month) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1420;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.fillStyle = "#fffef8";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#6f9369";
  context.lineWidth = 4;
  context.strokeRect(24, 24, 1032, 1372);
  context.fillStyle = "#326b36";
  context.beginPath();
  context.arc(92, 92, 48, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "white";
  context.font = "bold 50px Arial";
  context.textAlign = "center";
  context.fillText("⌂", 92, 110);
  context.textAlign = "left";
  context.fillStyle = "#326b36";
  context.font = "bold 38px Arial";
  context.fillText("PHIẾU THU TIỀN PHÒNG TRỌ", 160, 82);
  context.fillStyle = "#566b52";
  context.font = "bold 24px Arial";
  context.fillText(`THÁNG ${month.month}/${month.year}`, 160, 118);
  context.strokeStyle = "#6f9369";
  context.lineWidth = 3;
  context.strokeRect(866, 45, 160, 100);
  context.textAlign = "center";
  context.fillStyle = "#326b36";
  context.font = "bold 20px Arial";
  context.fillText("PHÒNG", 946, 77);
  context.font = "bold 36px Arial";
  context.fillText(invoice.room_code || "-", 946, 122);
  context.textAlign = "left";

  let y = 180;
  context.fillStyle = "#dce8d5";
  context.fillRect(45, y, 990, 48);
  context.fillStyle = "#345c37";
  context.font = "bold 22px Arial";
  context.fillText("NỘI DUNG", 62, y + 32);
  context.textAlign = "right";
  context.fillText("THÀNH TIỀN / THÔNG TIN", 1018, y + 32);
  context.textAlign = "left";
  y += 48;

  const rows: Array<[string, string, number?]> = [
    ["Địa chỉ nhà", invoice.address || "-", 76],
    ["Người thuê", invoice.tenant_name || "-"],
    ["Giá thuê", money(invoice.rent_amount)],
    ["Số điện đầu tháng (kWh)", formatNumber(invoice.electricity_start)],
    ["Số điện cuối tháng (kWh)", formatNumber(invoice.electricity_end)],
    ["Đơn giá điện (đ/kWh)", money(invoice.electricity_unit_price)],
    ["Tiền điện", money(electricityAmount(invoice))],
    ["Gửi xe", money(invoice.parking_fee)],
    ["Phí dịch vụ", money(invoice.service_fee)],
    ["Nước", money(invoice.water_fee)],
    ["Phí khác", money(invoice.other_fee)],
  ];
  for (const [label, value, customHeight] of rows) {
    const height = customHeight ?? 58;
    context.strokeStyle = "#b8c7b1";
    context.lineWidth = 1;
    context.strokeRect(45, y, 990, height);
    context.beginPath();
    context.moveTo(470, y);
    context.lineTo(470, y + height);
    context.stroke();
    context.fillStyle = "#344332";
    context.font = "22px Arial";
    context.fillText(label, 62, y + 36);
    context.textAlign = "right";
    context.font = "bold 22px Arial";
    if (customHeight) drawWrappedRight(context, value, 1018, y + 28, 520, 25);
    else context.fillText(value, 1018, y + 36);
    context.textAlign = "left";
    y += height;
  }

  context.fillStyle = "#326b36";
  context.fillRect(45, y, 990, 62);
  context.fillStyle = "white";
  context.font = "bold 24px Arial";
  context.fillText("TỔNG TIỀN CẦN THANH TOÁN", 62, y + 40);
  context.textAlign = "right";
  context.font = "bold 28px Arial";
  context.fillText(money(total(invoice)), 1018, y + 40);
  context.textAlign = "left";
  y += 98;
  context.fillStyle = "#344332";
  context.font = "bold 21px Arial";
  context.fillText("Ghi chú:", 55, y);
  context.font = "20px Arial";
  drawWrapped(context, invoice.note || "", 55, y + 34, 560, 27);
  const date = invoice.issue_date ? new Date(`${invoice.issue_date}T00:00:00`) : new Date();
  context.textAlign = "center";
  context.fillText(`Ngày ${date.getDate()} tháng ${date.getMonth() + 1} năm ${date.getFullYear()}`, 820, y);
  context.font = "italic 20px Arial";
  context.fillText("Người thu tiền", 820, y + 38);
  context.fillText("(Ký, ghi rõ họ tên)", 820, y + 68);

  const link = document.createElement("a");
  link.download = `phieu-thu-phong-${safeFileName(invoice.room_code)}-${month.month}-${month.year}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function drawWrapped(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = `${line}${line ? " " : ""}${word}`;
    if (line && context.measureText(next).width > maxWidth) {
      context.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else line = next;
  }
  if (line) context.fillText(line, x, y);
}

function drawWrappedRight(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = `${line}${line ? " " : ""}${word}`;
    if (line && context.measureText(next).width > maxWidth) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  lines.slice(0, 2).forEach((item, index) => context.fillText(item, x, y + index * lineHeight));
}

function safeFileName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-") || "phong";
}

function formatNumber(value: number) {
  return Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

function localDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function money(value: number) {
  return `${Number(value).toLocaleString("vi-VN")}đ`;
}

function Read({ value, emphasized = false }: { value: string | number; emphasized?: boolean }) {
  return <td className={`whitespace-nowrap border p-2 ${emphasized ? "bg-[#fff1d8] font-bold text-[#744722]" : "font-semibold"}`}>{typeof value === "number" ? money(value) : value}</td>;
}

function InputCell({ value, onChange, money = true }: { value: number; onChange: (value: string) => void; money?: boolean }) {
  return <td className="border p-0">{money ? <MoneyInput value={value} onValueChange={(amount) => onChange(String(amount))} className="w-full min-w-28 border-0 bg-white p-2 outline-none focus:bg-amber-50" /> : <input type="number" min={0} step="any" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(event.target.value)} className="w-full min-w-28 border-0 bg-white p-2 outline-none focus:bg-amber-50" />}</td>;
}

function SheetRead({ label, value, emphasized = false }: { label: string; value: string | number; emphasized?: boolean }) {
  return <tr><th className="w-[48%] border-r border-t border-[#a9825f]/30 bg-[#f3e1c9] p-3 text-left">{label}</th><td className={`border-t border-[#a9825f]/30 p-3 text-right ${emphasized ? "bg-[#fff1d8] text-base font-bold text-[#744722]" : "bg-white font-semibold"}`}>{typeof value === "number" ? money(value) : value}</td></tr>;
}

function SheetInput({ label, value, onChange, money = true }: { label: string; value: number; onChange: (value: string) => void; money?: boolean }) {
  return <tr><th className="w-[48%] border-r border-t border-[#a9825f]/30 bg-[#f3e1c9] p-3 text-left">{label}</th><td className="border-t border-[#a9825f]/30 bg-white p-1">{money ? <MoneyInput value={value} onValueChange={(amount) => onChange(String(amount))} className="w-full p-2 text-right font-semibold outline-none focus:bg-amber-50" /> : <input type="number" min={0} step="any" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(event.target.value)} className="w-full p-2 text-right font-semibold outline-none focus:bg-amber-50" />}</td></tr>;
}
