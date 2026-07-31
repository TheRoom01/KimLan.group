"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { readApiResponse } from "@/lib/api/client";

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
};
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
        <div className="mt-4 overflow-x-auto">
          {!form.id && selected ? (
            <p className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Tháng {selected.month}/{selected.year} chưa có dữ liệu đã lưu.
            </p>
          ) : null}

          <table className="w-full min-w-[1580px] border-collapse text-sm">
            <thead>
              <tr>
                {[
                  "Thu tiền",
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
                  "Tổng doanh thu",
                  "Đã thu",
                  "Còn thiếu",
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
                <Read value={form.room_code} />
                <Read value={form.tenant_name} />
                <InputCell value={form.deposit_amount} onChange={(value) => change("deposit_amount", value)} />
                <InputCell value={form.rent_amount} onChange={(value) => change("rent_amount", value)} />
                <InputCell value={form.electricity_start} onChange={(value) => change("electricity_start", value)} />
                <InputCell value={form.electricity_end} onChange={(value) => change("electricity_end", value)} />
                <InputCell value={form.electricity_unit_price} onChange={(value) => change("electricity_unit_price", value)} />
                <Read value={electricity} />
                <InputCell value={form.parking_fee} onChange={(value) => change("parking_fee", value)} />
                <InputCell value={form.service_fee} onChange={(value) => change("service_fee", value)} />
                <InputCell value={form.water_fee} onChange={(value) => change("water_fee", value)} />
                <InputCell value={form.other_fee} onChange={(value) => change("other_fee", value)} />
                <Read value={amount} emphasized />
                <Read value={form.paid_amount} />
                <Read value={missing} />
                <td className="border p-1">
                  <input value={form.note} onChange={(event) => change("note", event.target.value)} className="w-full min-w-40 border-0 bg-transparent p-2 outline-none focus:bg-amber-50" />
                </td>
              </tr>
            </tbody>
          </table>

          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => void openDetail()} className="rounded-xl border border-[#9d744f]/30 bg-white px-4 py-2 text-[#684324]">
              Chi tiết
            </button>
            <button onClick={() => void save()} disabled={saving || !selected} className="rounded-xl bg-[#744722] px-4 py-2 text-white disabled:opacity-50">
              {saving ? "Đang lưu..." : "Lưu doanh thu"}
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
                  <SheetInput label="Số điện đầu tháng (kWh)" value={form.electricity_start} onChange={(value) => change("electricity_start", value)} />
                  <SheetInput label="Số điện cuối tháng (kWh)" value={form.electricity_end} onChange={(value) => change("electricity_end", value)} />
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
    </section>
  );
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

function money(value: number) {
  return `${Number(value).toLocaleString("vi-VN")}đ`;
}

function Read({ value, emphasized = false }: { value: string | number; emphasized?: boolean }) {
  return <td className={`whitespace-nowrap border p-2 ${emphasized ? "bg-[#fff1d8] font-bold text-[#744722]" : "font-semibold"}`}>{typeof value === "number" ? money(value) : value}</td>;
}

function InputCell({ value, onChange }: { value: number; onChange: (value: string) => void }) {
  return <td className="border p-0"><input type="number" min={0} step="any" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(event.target.value)} className="w-full min-w-28 border-0 bg-white p-2 outline-none focus:bg-amber-50" /></td>;
}

function SheetRead({ label, value, emphasized = false }: { label: string; value: string | number; emphasized?: boolean }) {
  return <tr><th className="w-[48%] border-r border-t border-[#a9825f]/30 bg-[#f3e1c9] p-3 text-left">{label}</th><td className={`border-t border-[#a9825f]/30 p-3 text-right ${emphasized ? "bg-[#fff1d8] text-base font-bold text-[#744722]" : "bg-white font-semibold"}`}>{typeof value === "number" ? money(value) : value}</td></tr>;
}

function SheetInput({ label, value, onChange }: { label: string; value: number; onChange: (value: string) => void }) {
  return <tr><th className="w-[48%] border-r border-t border-[#a9825f]/30 bg-[#f3e1c9] p-3 text-left">{label}</th><td className="border-t border-[#a9825f]/30 bg-white p-1"><input type="number" min={0} step="any" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(event.target.value)} className="w-full p-2 text-right font-semibold outline-none focus:bg-amber-50" /></td></tr>;
}
