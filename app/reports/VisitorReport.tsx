import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Rank = { room_id?: string; room_code?: string; district?: string; ward?: string; views: number; visitors: number };
type Report = { visitors: number; actions: { action: string; events: number; visitors: number }[]; rooms: Rank[]; districts: Rank[]; wards: Rank[] };
const number = (n: number) => Number(n).toLocaleString("vi-VN");
const labels = [["filter_use", "Dùng bộ lọc"], ["room_view", "Xem chi tiết phòng"], ["admin_click", "Bấm nút Admin"]];

function Ranking({ title, rows, kind }: { title: string; rows: Rank[]; kind: "room" | "district" | "ward" }) {
  return <div className="min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white">
    <h3 className="border-b border-stone-200 p-4 text-lg font-bold">{title}</h3>
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="bg-stone-50 text-stone-500"><tr><th className="p-3 text-left">#</th><th className="p-3 text-left">{kind === "room" ? "Phòng / Khu vực" : "Khu vực"}</th><th className="whitespace-nowrap p-3 text-right">Lượt xem</th><th className="whitespace-nowrap p-3 text-right">Số khách</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={r.room_id ?? `${r.district}:${r.ward}`} className="border-t border-stone-100">
        <td className="p-3 text-stone-400">{i + 1}</td>
        <td className="p-3">{kind === "room" ? <><Link className="font-semibold text-amber-900 hover:underline" href={`/rooms/${r.room_id}`}>{r.room_code || r.room_id}</Link><div className="mt-1 text-xs text-stone-500">{[r.ward, r.district].filter(Boolean).join(", ") || "Chưa có khu vực"}</div></> : kind === "ward" ? [r.ward, r.district].filter(Boolean).join(", ") : r.district}</td>
        <td className="p-3 text-right font-semibold tabular-nums">{number(r.views)}</td><td className="p-3 text-right tabular-nums">{number(r.visitors)}</td>
      </tr>)}{rows.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-stone-500">Chưa có lượt xem trong khoảng thời gian này.</td></tr>}</tbody>
    </table></div>
  </div>;
}

export default async function VisitorReport({ days }: { days: number }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reports_visitors_v1", { p_days: days });
  const report = data as Report | null;
  return <section className="my-8 space-y-5 rounded-3xl border border-amber-900/15 bg-[#fcfaf7] p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold text-stone-900">Hoạt động khách truy cập</h2><p className="mt-1 text-sm text-stone-500">{days} ngày, gồm hôm nay · Giờ Việt Nam · Chỉ admin L1</p></div>
      <nav aria-label="Khoảng thời gian báo cáo" className="flex gap-2">{[7,30,90].map(d => <Link key={d} href={`/reports?days=${d}`} aria-current={d === days ? "page" : undefined} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${d === days ? "border-amber-900 bg-amber-900 text-white" : "border-stone-200 bg-white text-stone-600"}`}>{d} ngày</Link>)}</nav>
    </div>
    {error || !report ? <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">Không thể tải thống kê khách truy cập. Vui lòng thử lại sau.</p> : <>
      <div className="flex flex-wrap gap-x-10 gap-y-4 rounded-2xl border border-stone-200 bg-white p-5 text-amber-950">
        <div><span aria-hidden="true">♙ </span><strong className="text-3xl tabular-nums">{number(report.visitors)}</strong> <span className="text-sm">khách truy cập</span></div>
        <div className="self-center"><span aria-hidden="true">◉ </span><strong className="tabular-nums">{number(report.actions.find(a => a.action === "page_view")?.events ?? 0)}</strong> <span className="text-sm">lượt xem trang</span></div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white"><table className="w-full text-sm"><thead className="bg-stone-50 text-stone-500"><tr><th className="p-4 text-left">Thao tác</th><th className="p-4 text-right">Số khách</th><th className="p-4 text-right">Tỷ lệ khách</th><th className="p-4 text-right">Số lượt</th></tr></thead><tbody>
        {labels.map(([key,label]) => { const action = report.actions.find(a => a.action === key); const count = Number(action?.visitors ?? 0); const rate = report.visitors ? count / report.visitors * 100 : 0;
          return <tr key={key} className="border-t border-stone-100"><td className="p-4 font-medium">{label}</td><td className="p-4 text-right tabular-nums">{number(count)}</td><td className="p-4 text-right tabular-nums">{rate.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</td><td className="p-4 text-right tabular-nums">{number(action?.events ?? 0)}</td></tr>;
        })}
      </tbody></table></div>
      <p className="text-xs leading-5 text-stone-500">Khách được nhận diện theo trình duyệt, loại trừ phiên đã đăng nhập admin. Tỷ lệ = số khách thực hiện thao tác / tổng khách trong kỳ; một khách có thể thực hiện nhiều thao tác. Số liệu bắt đầu từ khi bật thống kê. Xóa dữ liệu trình duyệt hoặc đổi thiết bị có thể được tính là khách mới.</p>
      <Ranking title="Top 20 phòng được xem nhiều nhất" rows={report.rooms} kind="room" />
      <div className="grid gap-5 lg:grid-cols-2"><Ranking title="Top 5 quận được xem nhiều nhất" rows={report.districts} kind="district" /><Ranking title="Top 5 phường được xem nhiều nhất" rows={report.wards} kind="ward" /></div>
      <p className="text-xs text-stone-500">Xếp hạng theo lượt mở chi tiết phòng; khu vực lấy theo thông tin phòng tại thời điểm xem. Phòng chưa có quận/phường không được tính vào bảng khu vực tương ứng.</p>
    </>}
  </section>;
}
