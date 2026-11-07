import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { restoreRoomHistory } from "./actions";
import RestoreSubmit from "./RestoreSubmit";

const PATH = "/reports/room-history";
const PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const actions = {
  CREATE_ROOM: "Tạo phòng", UPDATE_ROOM: "Cập nhật phòng", MEDIA_UPDATE: "Cập nhật media",
  HIDE_ROOM: "Ẩn phòng", ARCHIVE_ROOM: "Đưa vào thùng rác", RESTORE_ROOM: "Khôi phục",
  DELETE_ROOM: "Xóa vĩnh viễn", PURGE_ROOM: "Dọn phòng đã lưu trữ", APPROVE_IMPORT_UPDATE: "Duyệt cập nhật từ Zalo",
} as const;
const sources = {
  admin: "Admin", admin_api: "API quản trị", owner_portal: "Cổng chủ nhà", zalo_import: "Zalo Imports",
  zalo_automation: "Zalo tự động", system_sync: "Đồng bộ hệ thống", system: "Hệ thống", service: "Dịch vụ máy chủ",
  direct: "Ghi trực tiếp", history_restore: "Khôi phục từ lịch sử",
} as const;
const roles: Record<string, string> = { admin_l1: "Admin L1", admin_l2: "Admin L2", owner: "Chủ nhà", manager: "Quản lý", system: "Hệ thống", authenticated: "Người dùng" };
const fields: Record<string, string> = {
  price: "Giá", status: "Trạng thái thuê", room_code: "Mã phòng", room_type: "Loại phòng", address: "Địa chỉ",
  available_from: "Ngày trống", lifecycle_status: "Vòng đời", publish_status: "Xuất bản", is_hidden: "Ẩn phòng",
  property_id: "Tòa nhà", archived_at: "Ngày đưa vào thùng rác", sort_order: "Thứ tự media", is_cover: "Ảnh bìa",
  media_reference_changed: "Thay thế tệp media", media: "Media tham chiếu", details: "Chi tiết phòng",
};
type AuditEvent = {
  id: string; room_id: string; entity: string; action: keyof typeof actions; source: keyof typeof sources;
  actor_user_id: string | null; actor_display_name_snapshot: string | null; actor_role: string;
  room_reference: { code?: string; address?: string; media_id?: string }; operation_id: string; created_at: string;
  changed_fields: string[]; before_data: Record<string, unknown>; after_data: Record<string, unknown>;
};
type Params = Record<string, string | string[] | undefined>;
const input = "min-h-10 min-w-0 rounded-lg border border-[var(--room-border,#80634a)] bg-transparent px-3 text-sm";
const surface = "rounded-2xl border border-[var(--room-border,#80634a)] bg-[var(--room-surface,#392517)] p-4 text-[var(--room-text,#fff4e5)]";
const dateFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" });

function value(params: Params, key: string) {
  const item = params[key];
  return typeof item === "string" ? item.trim() : "";
}
function searchText(input: string) {
  return input.slice(0, 120).replace(/[^\p{L}\p{N}\s/.-]/gu, " ").trim();
}
function day(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return "";
  const date = new Date(`${input}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === input ? input : "";
}
function display(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "object" && "redacted" in value) return "Nội dung được bảo vệ";
  return typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
}

const results: Record<string, string> = {
  restored: "Đã khôi phục và ghi một thao tác mới vào lịch sử.",
  conflict: "Phòng hoặc tòa nhà đã thay đổi. Hãy kiểm tra lại trước khi khôi phục.",
  missing: "Phòng hoặc bản ghi lịch sử không còn tồn tại.",
  invalid: "Yêu cầu khôi phục không hợp lệ.",
  failed: "Không thể khôi phục trường này. Hãy kiểm tra lại dữ liệu phòng.",
};

export default async function RoomHistoryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/?auth=login");
  const { data: level, error: levelError } = await supabase.rpc("get_my_admin_level");
  if (levelError || Number(level) !== 1) redirect("/admin");

  const params = await searchParams;
  const q = searchText(value(params, "q"));
  const actor = searchText(value(params, "actor"));
  const action = value(params, "action");
  const source = value(params, "source");
  const from = day(value(params, "from"));
  const to = day(value(params, "to"));
  const requestedPage = Number(value(params, "page"));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1;
  const offset = (page - 1) * PAGE_SIZE;

  let query = supabase.from("room_audit_events")
    .select("id,room_id,entity,action,source,actor_user_id,actor_display_name_snapshot,actor_role,room_reference,operation_id,created_at,changed_fields,before_data,after_data", { count: "exact" })
    .order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
  if (UUID.test(q)) query = query.or(`room_id.eq.${q},actor_user_id.eq.${q}`);
  else if (q) query = query.or(`room_reference->>code.ilike."*${q}*",room_reference->>address.ilike."*${q}*",actor_display_name_snapshot.ilike."*${q}*"`);
  if (UUID.test(actor)) query = query.eq("actor_user_id", actor);
  else if (actor) query = query.ilike("actor_display_name_snapshot", `%${actor}%`);
  if (Object.hasOwn(actions, action)) query = query.eq("action", action);
  if (Object.hasOwn(sources, source)) query = query.eq("source", source);
  if (from) query = query.gte("created_at", `${from}T00:00:00+07:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999999+07:00`);

  const [history, summary] = await Promise.all([query, supabase.rpc("room_audit_today_v1")]);
  const events = (history.data ?? []) as AuditEvent[];
  const stats = summary.data?.[0];
  const ids = [...new Set(events.map(event => event.room_id))];
  const rooms = ids.length ? await supabase.from("rooms").select("id").in("id", ids) : { data: [] };
  const present = new Set(rooms.data?.map(room => room.id));
  const pageHref = (next: number) => {
    const search = new URLSearchParams({ page: String(next) });
    for (const [key, item] of Object.entries({ q, actor, action, source, from, to })) if (item) search.set(key, item);
    return `${PATH}?${search}`;
  };
  const result = value(params, "result");

  return (
    <main className="room-history mx-auto w-full max-w-6xl space-y-4 px-3 py-6 text-[var(--room-text,#3f2f24)] sm:px-6">
      <Link href="/reports" className="text-sm font-semibold underline">Về báo cáo</Link>
      <h1 className="text-2xl font-bold sm:text-3xl">Lịch sử thao tác phòng</h1>
      {Object.hasOwn(results, result) && <p role="status" className={surface}>{results[result]}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([["Thao tác hôm nay", "total"], ["Cập nhật", "updates"], ["Ẩn / xóa", "removals"], ["Khôi phục", "restores"]] as const).map(([title, key]) => (
          <div key={key} className={surface}><div className="text-sm">{title}</div><div className="text-2xl font-bold">{stats?.[key]?.toLocaleString("vi-VN") ?? "—"}</div></div>
        ))}
      </div>
      <form action={PATH} className={`${surface} grid gap-3 sm:grid-cols-3`}>
        <label className="grid gap-1 text-sm">Mã phòng, địa chỉ, ID hoặc người thực hiện<input name="q" defaultValue={q} maxLength={120} className={input} /></label>
        <label className="grid gap-1 text-sm">Người thực hiện<input name="actor" defaultValue={actor} maxLength={120} className={input} /></label>
        <label className="grid gap-1 text-sm">Thao tác<select name="action" defaultValue={action} className={input}><option value="">Tất cả</option>{Object.entries(actions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Nguồn<select name="source" defaultValue={source} className={input}><option value="">Tất cả</option>{Object.entries(sources).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Từ ngày<input name="from" type="date" defaultValue={from} className={input} /></label>
        <label className="grid gap-1 text-sm">Đến ngày<input name="to" type="date" defaultValue={to} className={input} /></label>
        <div className="flex items-center gap-3 sm:col-span-3"><button className="rounded-lg bg-[#744722] px-4 py-2 text-sm font-semibold text-white">Lọc lịch sử</button><Link href={PATH} className="text-sm underline">Xóa bộ lọc</Link></div>
      </form>
      {history.error ? <p role="alert" className={surface}>Không tải được lịch sử thao tác. Kiểm tra cơ sở dữ liệu đã áp dụng migration audit.</p> :
        events.length === 0 ? <p className={surface}>Không có thao tác phù hợp.</p> : events.map(event => {
          const exists = present.has(event.room_id);
          const canPrice = exists && event.entity === "rooms" && ["UPDATE_ROOM", "APPROVE_IMPORT_UPDATE", "RESTORE_ROOM"].includes(event.action)
            && event.changed_fields.includes("price") && (typeof event.before_data.price === "number" || event.before_data.price === null);
          const canVisibility = exists && event.entity === "rooms" && ["HIDE_ROOM", "ARCHIVE_ROOM"].includes(event.action)
            && event.before_data.lifecycle_status === "active" && event.before_data.is_hidden === false
            && ["draft", "published"].includes(String(event.before_data.publish_status));
          return (
            <details key={event.id} className={surface}>
              <summary className="cursor-pointer space-y-1">
                <strong>{actions[event.action] ?? event.action} · {event.room_reference.code || event.room_id.slice(0, 8)}</strong>
                <span className="block break-words text-sm">{event.room_reference.address || "Chưa có địa chỉ"}</span>
                <span className="block break-words text-xs opacity-85">{dateFormat.format(new Date(event.created_at))} · {event.actor_display_name_snapshot || roles[event.actor_role] || event.actor_role} · {sources[event.source] ?? event.source}</span>
              </summary>
              <div className="mt-3 space-y-3 border-t border-[var(--room-border,#80634a)] pt-3">
                <p className="break-all text-xs">Phòng {event.room_id} · Thao tác {event.operation_id}{event.actor_user_id ? ` · Người thực hiện ${event.actor_user_id}` : ""}</p>
                {event.room_reference.media_id && <p className="break-all text-xs">Media {event.room_reference.media_id}</p>}
                {exists ? <Link className="text-sm underline" href={`/rooms/${event.room_id}`}>Mở phòng hiện tại</Link> : <p className="text-sm">Phòng đã bị xóa hoặc không còn truy cập được. Không thể tạo lại từ lịch sử.</p>}
                <div className="space-y-2">
                  {event.changed_fields.map(field => (
                    <div key={field} className="rounded-lg border border-[var(--room-border,#80634a)] p-2">
                      <strong className="text-sm">{fields[field] ?? field}</strong>
                      <div className="mt-1 grid gap-2 sm:grid-cols-2">
                        <div className="min-w-0 rounded bg-red-500/15 p-2 text-sm"><span className="font-semibold">Trước</span><pre className="whitespace-pre-wrap break-words font-sans">{display(event.before_data[field])}</pre></div>
                        <div className="min-w-0 rounded bg-emerald-500/15 p-2 text-sm"><span className="font-semibold">Sau</span><pre className="whitespace-pre-wrap break-words font-sans">{display(event.after_data[field])}</pre></div>
                      </div>
                    </div>
                  ))}
                </div>
                {event.entity === "room_media" && <p className="text-sm">Lịch sử giữ thông tin tham chiếu media. Tệp đã xóa cần được tải lên lại.</p>}
                {canPrice && <RestoreOption eventId={event.id} field="price" label="Khôi phục giá" preview={`Giá sẽ đổi từ ${event.after_data.price ?? "chưa có giá"} về ${event.before_data.price ?? "chưa có giá"}.`} />}
                {canVisibility && <RestoreOption eventId={event.id} field="visibility" label="Khôi phục hiển thị" preview={`Phòng sẽ trở lại trạng thái hoạt động, hiển thị và xuất bản ở chế độ ${event.before_data.publish_status === "published" ? "công khai" : "bản nháp"}.`} />}
              </div>
            </details>
          );
        })}
      {!history.error && <nav aria-label="Phân trang lịch sử" className="flex flex-wrap items-center gap-4 text-sm">
        {page > 1 && <Link className="underline" href={pageHref(page - 1)}>Trang trước</Link>}
        <span>Trang {page} · {history.count ?? 0} thao tác</span>
        {(history.count ?? 0) > offset + PAGE_SIZE && page < 10000 && <Link className="underline" href={pageHref(page + 1)}>Trang sau</Link>}
      </nav>}
    </main>
  );
}

function RestoreOption({ eventId, field, label, preview }: { eventId: string; field: "price" | "visibility"; label: string; preview: string }) {
  return (
    <details className="rounded-lg border border-[var(--room-border,#80634a)] p-3">
      <summary className="cursor-pointer font-semibold">{label}</summary>
      <form action={restoreRoomHistory} className="mt-2 space-y-2">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="field" value={field} />
        <p className="text-sm">{preview} Nếu giá trị hiện tại đã đổi, thao tác sẽ bị từ chối.</p>
        <RestoreSubmit />
      </form>
    </details>
  );
}
