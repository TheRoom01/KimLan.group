import { createSupabaseServerClient } from "@/lib/supabase/server";

type StaffEvent = {
  id: number;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  target_id: string;
  action: string;
  source: string;
  changed_fields: string[];
  old_data: Record<string, string | number | null>;
  new_data: Record<string, string | number | null>;
  created_at: string;
};

const labels: Record<string, string> = {
  grant: "Tạo hoặc cấp quyền tài khoản", role: "Đổi cấp quyền", delete: "Thu hồi quyền Admin",
  profile: "Đổi hồ sơ", phone: "Đổi số điện thoại", lock: "Khóa tài khoản", unlock: "Mở khóa tài khoản", signup_date: "Đổi ngày đăng ký",
  level: "Cấp quyền", full_name: "Họ tên", email: "Email quản trị", auth_email: "Email đăng nhập",
  auth_profile: "Hồ sơ đăng nhập", auth_phone: "SĐT đăng nhập", staff_created_at: "Ngày cấp quyền",
  auth_created_at: "Ngày đăng ký", banned_until: "Khóa đến ngày",
};
const date = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });

function formatValue(field: string, value: string | number | null | undefined) {
  if (value == null) return "—";
  if (field === "level") return `L${value}`;
  if (value === "infinity") return "Không giới hạn";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : date.format(parsed);
}

export default async function StaffAuditReport() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reports_staff_audit_v1");
  const events = Array.isArray(data) ? data as StaffEvent[] : [];
  return <section className="my-8 space-y-4 rounded-3xl border border-amber-900/15 bg-[#fcfaf7] p-4 sm:p-6">
    <div>
      <h2 className="text-2xl font-bold text-stone-900">Nhật ký tài khoản Admin</h2>
      <p className="mt-1 text-sm text-stone-500">Tối đa 50 thay đổi gần nhất · Lưu 90 ngày · Chỉ Admin L1</p>
    </div>
    {error ? <p role="alert" className="text-sm text-stone-600">Chưa tải được nhật ký tài khoản.</p> : events.length ?
      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white"><table className="w-full text-left text-sm">
        <thead className="bg-stone-50 text-stone-600"><tr><th className="p-3">Thời điểm</th><th className="p-3">Người thực hiện</th><th className="p-3">Thao tác</th><th className="p-3">Tài khoản</th><th className="p-3">Thay đổi</th></tr></thead>
        <tbody>{events.map(event => <tr key={event.id} className="border-t border-stone-100 align-top">
          <td className="whitespace-nowrap p-3">{date.format(new Date(event.created_at))}</td>
          <td className="p-3">{event.actor_name ?? (event.source === "system" ? "Hệ thống" : "Chưa lưu tên")}
            <div className="whitespace-nowrap text-xs text-stone-500">{event.actor_role === "admin_l1" ? "Admin L1" : event.actor_role === "admin_l2" ? "Admin L2" : "Nguồn hệ thống"}</div>
          </td>
          <td className="p-3 font-medium">{labels[event.action] ?? event.action}</td>
          <td className="p-3 text-xs text-stone-600">{event.target_id}</td>
          <td className="p-3">{event.changed_fields.map(field => <div key={field}>{labels[field] ?? field}{(field in event.old_data || field in event.new_data) && <span className="ml-1 text-stone-600">{formatValue(field, event.old_data[field])} → {formatValue(field, event.new_data[field])}</span>}</div>)}</td>
        </tr>)}</tbody>
      </table></div> : <p className="text-sm text-stone-600">Chưa có thay đổi tài khoản trong kỳ lưu.</p>}
  </section>;
}
