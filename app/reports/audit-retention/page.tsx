import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const sources = {
  owner_audit: "Audit nghiệp vụ",
  customer_activity: "Hoạt động khách",
  staff_audit: "Tài khoản quản trị",
  zalo_reader: "Zalo Reader",
  cron_runs: "Lượt chạy Cron",
};

type Source = keyof typeof sources;
type Counts = { remaining: number; expired: number; held: number; without_expiry?: number; bytes: number };
type Status = {
  enabled: boolean;
  last_run_at: string | null;
  last_deleted: Partial<Record<Source, number>>;
  last_errors: Partial<Record<Source, string>>;
  sources: Record<Source, Counts>;
};
type Event = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  source: string | null;
  changed_fields: string[];
  old_data: unknown;
  new_data: unknown;
  operation_id: string | null;
  created_at: string;
  expires_at: string;
};

const countFormat = new Intl.NumberFormat("vi-VN");
const dateFormat = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Ho_Chi_Minh",
});
const panel = "overflow-x-auto rounded-xl border border-[var(--room-border,#d6c8b9)] bg-[var(--room-surface,#fffdf7)] p-4 text-[var(--room-text,#392517)]";
const cell = "px-3 py-2 text-left";

function date(value: string | null) {
  return value ? dateFormat.format(new Date(value)) : "—";
}

export default async function AuditRetentionPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/?auth=login");
  const { data: level, error: levelError } = await supabase.rpc("get_my_admin_level");
  if (levelError || Number(level) !== 1) redirect("/admin");

  const [statusResult, eventsResult] = await Promise.all([
    supabase.rpc("get_audit_retention_status_v1"),
    supabase.rpc("get_recent_operational_audit_v1"),
  ]);
  const status = statusResult.data as Status | null;
  const events = (eventsResult.data ?? []) as Event[];

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <Link href="/reports" className="text-sm font-medium underline">Về báo cáo</Link>
      <h1 className="text-2xl font-bold">Nhật ký và lưu trữ</h1>
      <section className={panel} aria-label="Thống kê lưu trữ">
        <h2 className="text-lg font-semibold">Dọn nhật ký hằng ngày</h2>
        {statusResult.error || !status ? <p>Chưa thể tải thống kê lưu trữ.</p> : (
          <>
            <p className="mt-1 text-sm">
              {status.enabled ? "Đã bật" : "Chưa bật"} · Lần gần nhất {date(status.last_run_at)}
            </p>
            <table className="mt-3 w-full text-sm">
              <thead><tr>
                {["Nguồn", "Còn lại", "Hết hạn có thể dọn", "Giữ lại theo yêu cầu", "Chưa có hạn", "Dung lượng bảng (MiB)", "Đã dọn lần gần nhất"].map(label => (
                  <th key={label} scope="col" className={cell}>{label}</th>
                ))}
              </tr></thead>
              <tbody>
                {(Object.keys(sources) as Source[]).map(source => {
                  const counts = status.sources[source];
                  const error = status.last_errors[source];
                  const deleted = status.last_deleted[source];
                  return <tr key={source} className="border-t border-[var(--room-border,#d6c8b9)]">
                    <th scope="row" className={cell}>{sources[source]}</th>
                    <td className={cell}>{countFormat.format(counts.remaining)}</td>
                    <td className={cell}>{countFormat.format(counts.expired)}</td>
                    <td className={cell}>{countFormat.format(counts.held)}</td>
                    <td className={cell}>{counts.without_expiry == null ? "—" : countFormat.format(counts.without_expiry)}</td>
                    <td className={cell}>{countFormat.format(counts.bytes / 1048576)}</td>
                    <td className={cell}>{error ? `Lỗi ${error}` : deleted == null ? "—" : countFormat.format(deleted)}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </>
        )}
      </section>
      <section className={panel}>
        <h2 className="text-lg font-semibold">Audit nghiệp vụ gần đây</h2>
        {eventsResult.error ? <p>Chưa thể tải audit nghiệp vụ.</p> : events.length === 0 ? (
          <p>Chưa có sự kiện theo chính sách mới.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead><tr>
              {["Thao tác", "Người thực hiện", "Nguồn", "Thay đổi", "Thời hạn"].map(label => (
                <th key={label} scope="col" className={cell}>{label}</th>
              ))}
            </tr></thead>
            <tbody>{events.map(event => (
              <tr key={event.id} className="border-t border-[var(--room-border,#d6c8b9)] align-top">
                <th scope="row" className={cell}>
                  {event.action}
                  <span className="block break-all font-normal">{event.entity_type} · {event.entity_id}</span>
                  {event.operation_id && <span className="block break-all font-normal">{event.operation_id}</span>}
                </th>
                <td className={cell}>{event.actor_name || event.actor_id || "Hệ thống"}<br />{event.actor_role || "—"}</td>
                <td className={cell}>{event.source || "—"}</td>
                <td className={cell}>
                  {event.changed_fields.join(", ") || "—"}
                  {(event.old_data != null || event.new_data != null) && (
                    <details>
                      <summary className="cursor-pointer">Giá trị trước và sau</summary>
                      <pre className="max-w-sm whitespace-pre-wrap break-all">{JSON.stringify({ trước: event.old_data, sau: event.new_data }, null, 2)}</pre>
                    </details>
                  )}
                </td>
                <td className={cell}>{date(event.created_at)}<br />Hết hạn {date(event.expires_at)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </main>
  );
}
