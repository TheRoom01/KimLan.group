"use client";

import { Loader2, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { readApiResponse } from "@/lib/api/client";

type Revenue = { id?: string; revenue_month: string; room_code: string; deposit_amount: number; rent_amount: number; electricity_start: number; electricity_end: number; electricity_unit_price: number; water_fee: number; service_fee: number; other_fee: number; total_revenue?: number; note: string; status: "draft" | "confirmed" | "paid" };
type ContractInput = { id: string; start_date?: string | null; end_date?: string | null; monthly_price?: number | null; deposit_amount?: number | null; room?: { room_code?: string | null } | null };

export default function ContractRevenueTable({ contract }: { contract: ContractInput }) {
  const months = useMemo(() => monthList(contract.start_date, contract.end_date), [contract.start_date, contract.end_date]);
  const [selected, setSelected] = useState(months[0] ?? "");
  const [records, setRecords] = useState<Revenue[]>([]);
  const [form, setForm] = useState<Revenue>(() => emptyRevenue(contract, months[0] ?? ""));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void load(); }, [contract.id]);
  useEffect(() => { setForm(records.find((item) => item.revenue_month === selected) ?? emptyRevenue(contract, selected)); }, [selected, records, contract]);

  async function load() { setLoading(true); setError(null); try { setRecords(await readApiResponse<Revenue[]>(await fetch(`/api/owner/contracts/${contract.id}/revenues`, { cache: "no-store" }))); } catch (e) { setError(e instanceof Error ? e.message : "Không thể tải doanh thu"); } finally { setLoading(false); } }
  function change(key: keyof Revenue, value: string) { setForm((current) => ({ ...current, [key]: key === "note" || key === "status" ? value : Number(value || 0) })); }
  async function save() { setSaving(true); setError(null); try { const url = form.id ? `/api/owner/contracts/${contract.id}/revenues/${form.id}` : `/api/owner/contracts/${contract.id}/revenues`; const saved = await readApiResponse<Revenue>(await fetch(url, { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })); setRecords((items) => [...items.filter((item) => item.revenue_month !== saved.revenue_month), saved].sort((a,b)=>a.revenue_month.localeCompare(b.revenue_month))); } catch(e){setError(e instanceof Error?e.message:"Không thể lưu doanh thu");} finally{setSaving(false);} }
  async function remove(){if(!form.id||!window.confirm("Xóa doanh thu tháng này?"))return;setSaving(true);setError(null);try{await readApiResponse(await fetch(`/api/owner/contracts/${contract.id}/revenues/${form.id}`,{method:"DELETE"}));setRecords((items)=>items.filter((item)=>item.id!==form.id));}catch(e){setError(e instanceof Error?e.message:"Không thể xóa doanh thu");}finally{setSaving(false);}}
  const electricity=Math.max(0,form.electricity_end-form.electricity_start)*form.electricity_unit_price;
  const total=form.rent_amount+electricity+form.water_fee+form.service_fee+form.other_fee;

  return <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-[#432918]">Doanh thu hàng tháng</h2><p className="mt-1 text-sm text-[#80634a]">Theo dõi tiền thuê và chi phí vận hành từng tháng.</p></div><select value={form.status} onChange={(e)=>change("status",e.target.value)} className="rounded-xl border border-[#956b45]/30 bg-white px-3 py-2 text-sm"><option value="draft">Nháp</option><option value="confirmed">Đã xác nhận</option><option value="paid">Đã thanh toán</option></select></div>
    <div className="mt-4 flex gap-2 overflow-x-auto pb-2">{months.map((month)=><button type="button" key={month} onClick={()=>setSelected(month)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${selected===month?"bg-[#744722] text-white":"bg-[#eadbc8] text-[#684324]"}`}>Tháng {Number(month.slice(5,7))}/{month.slice(0,4)}</button>)}</div>
    {loading?<div className="grid min-h-32 place-items-center"><Loader2 className="animate-spin"/></div>:months.length===0?<p className="mt-4 text-sm text-[#80634a]">Hợp đồng chưa có khoảng thời gian hợp lệ.</p>:<><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1180px] border-collapse text-sm"><thead><tr>{["Mã phòng","Tiền cọc","Giá thuê phòng","Số điện đầu (kWh)","Số điện cuối (kWh)","Đơn giá điện","Phí DV","Phí Nước","Phí điện","Tổng doanh thu phòng","Ghi chú"].map((label)=><th key={label} className="border border-[#956b45]/20 bg-[#f3e1c9] px-3 py-2 text-left text-[#432918]">{label}</th>)}</tr></thead><tbody><tr>
      <Cell value={form.room_code}/><Cell value={form.deposit_amount} money/><Cell value={form.rent_amount} money/><InputCell value={form.electricity_start} onChange={(v)=>change("electricity_start",v)}/><InputCell value={form.electricity_end} onChange={(v)=>change("electricity_end",v)}/><InputCell value={form.electricity_unit_price} onChange={(v)=>change("electricity_unit_price",v)}/><InputCell value={form.service_fee} onChange={(v)=>change("service_fee",v)}/><InputCell value={form.water_fee} onChange={(v)=>change("water_fee",v)}/><Cell value={electricity} money/><Cell value={total} money/><td className="border border-[#956b45]/20 p-1"><input value={form.note} onChange={(e)=>change("note",e.target.value)} className="w-full min-w-40 rounded-lg border bg-white px-2 py-2"/></td>
    </tr></tbody></table></div><div className="mt-4 flex justify-end gap-2">{form.id?<button type="button" onClick={()=>void remove()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700"><Trash2 size={15}/>Xóa</button>:null}<button type="button" onClick={()=>void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#744722] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving?<Loader2 size={15} className="animate-spin"/>:<Save size={15}/>}Lưu doanh thu</button></div></>}
    {error?<p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>:null}
  </section>;
}

function monthList(start?:string|null,end?:string|null){if(!start||!end)return[];const cursor=new Date(`${start.slice(0,7)}-01T00:00:00Z`);const last=new Date(`${end.slice(0,7)}-01T00:00:00Z`);const result:string[]=[];while(cursor<=last&&result.length<240){result.push(cursor.toISOString().slice(0,10));cursor.setUTCMonth(cursor.getUTCMonth()+1);}return result;}
function emptyRevenue(contract:ContractInput,month:string):Revenue{return{revenue_month:month,room_code:contract.room?.room_code??"",deposit_amount:Number(contract.deposit_amount??0),rent_amount:Number(contract.monthly_price??0),electricity_start:0,electricity_end:0,electricity_unit_price:0,water_fee:0,service_fee:0,other_fee:0,note:"",status:"draft"};}
function Cell({value,money=false}:{value:string|number;money?:boolean}){return<td className="border border-[#956b45]/20 bg-white px-3 py-2 font-semibold text-[#432918]">{money?Number(value).toLocaleString("vi-VN"):value}</td>;}
function InputCell({value,onChange}:{value:number;onChange:(value:string)=>void}){return<td className="border border-[#956b45]/20 p-1"><input type="number" min={0} step="any" value={value} onChange={(e)=>onChange(e.target.value)} className="w-full min-w-24 rounded-lg border bg-white px-2 py-2"/></td>;}
