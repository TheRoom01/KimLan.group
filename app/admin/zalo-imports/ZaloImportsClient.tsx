"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import RoomModal from "@/app/admin/RoomModal";
import type { TabKey } from "@/app/types/room";

type ImportRow = {
  id: string;
  status: string;
  confidence_score?: number | null;
  room_payload?: any;
  detail_payload?: any;
  source_field_map?: Record<string, string>;
  inherited_field_map?: Record<string, string>;
  matched_room_id?: string | null;
  matched_reason?: string | null;
  old_status?: string | null;
  new_status?: string | null;
  created_at?: string;
  batch?: {
    group_name?: string;
    sender_name?: string;
    raw_text?: string;
    sent_at?: string;
  };
  images?: any[];
};

const PAGE_SIZE = 20;

export default function ZaloImportsClient() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

    const [editingPending, setEditingPending] = useState<ImportRow | null>(null);
  const [openPendingModal, setOpenPendingModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("info");

  async function loadData(nextOffset = offset, nextStatus = status) {
    try {
      setLoading(true);
      setErrorMsg(null);

      const qs = new URLSearchParams();
      qs.set("limit", String(PAGE_SIZE));
      qs.set("offset", String(nextOffset));
      if (nextStatus) qs.set("status", nextStatus);

      const res = await fetch(`/api/admin/zalo-imports?${qs.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Load thất bại");
      }

      setRows(json.data ?? []);
      setTotal(Number(json.total ?? 0));
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Load thất bại");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(0, status);
    setOffset(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const page = useMemo(() => Math.floor(offset / PAGE_SIZE) + 1, [offset]);
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total]
  );

    async function deleteAllCurrentRows() {
    if (rows.length === 0) return;

    const ok = window.confirm(
      `Bạn có chắc muốn xoá tất cả ${rows.length} card đang hiển thị trên trang này? Ảnh tạm R2 cũng sẽ bị xoá.`
    );

    if (!ok) return;

    const res = await fetch("/api/admin/zalo-imports/bulk-remove", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ids: rows.map((r) => r.id),
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json?.ok) {
      alert(json?.error || "Xoá tất cả thất bại");
      return;
    }

    alert(`Đã xoá ${json.deleted || rows.length} import.`);
    await loadData(0, status);
    setOffset(0);
  }

  return (
    <main style={wrap}>
      <div style={topBar}>
        <div>
          <h1 style={title}>Zalo Imports</h1>
          <div style={subTitle}>Tin phòng tự động đọc từ nhóm Zalo</div>
        </div>

        <a href="/admin" style={backBtn}>
          ← Quay lại Admin
        </a>
      </div>

      <div style={filterBar}>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={select}
        >
          <option value="">Tất cả</option>
          <option value="Chờ duyệt">Chờ duyệt</option>
          <option value="Trùng phòng">Trùng phòng</option>
          <option value="Đã duyệt">Đã duyệt</option>
          <option value="Từ chối">Từ chối</option>
          <option value="Hết hạn">Hết hạn</option>
        </select>

        <button onClick={() => loadData(offset, status)} style={refreshBtn}>
          Tải lại
        </button>

        <button
          onClick={deleteAllCurrentRows}
          style={bulkDeleteBtn}
          disabled={loading || rows.length === 0}
        >
          Xóa tất cả phòng
        </button>
      </div>

      {errorMsg && <div style={errorBox}>{errorMsg}</div>}

      {loading ? (
        <div style={emptyBox}>Đang tải...</div>
      ) : rows.length === 0 ? (
        <div style={emptyBox}>Chưa có import nào.</div>
      ) : (
        <div style={list}>
          {rows.map((row) => (
            <ImportCard
            key={row.id}
            row={row}
            onChanged={() => loadData(offset, status)}
            onEdit={(r) => {
                setEditingPending(r);
                setActiveTab("info");
                setOpenPendingModal(true);
            }}
            />
          ))}
        </div>
      )}

      <div style={pagination}>
        <button
          style={pageBtn}
          disabled={offset <= 0 || loading}
          onClick={() => {
            const next = Math.max(0, offset - PAGE_SIZE);
            setOffset(next);
            loadData(next, status);
          }}
        >
          ← Trước
        </button>

        <div style={muted}>
          Trang <b>{page}</b> / <b>{totalPages}</b> · Tổng <b>{total}</b>
        </div>

        <button
          style={pageBtn}
          disabled={offset + PAGE_SIZE >= total || loading}
          onClick={() => {
            const next = offset + PAGE_SIZE;
            setOffset(next);
            loadData(next, status);
          }}
        >
          Sau →
        </button>
      </div>

            {openPendingModal && editingPending && (
        <RoomModal
          mode="pending"
          pendingId={editingPending.id}
          pendingRoomPayload={editingPending.room_payload ?? {}}
          pendingDetailPayload={editingPending.detail_payload ?? {}}
          open={openPendingModal}
          onClose={() => setOpenPendingModal(false)}
          editingRoom={null}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onNotify={(msg) => alert(msg)}
          onPendingSaved={async () => {
            await loadData(offset, status);
          }}
          onSaved={async () => {}}
        />
      )}

    </main>
  );
}

function ImportCard({
  row,
  onChanged,
  onEdit,
}: {
  row: ImportRow;
  onChanged?: () => void;
  onEdit?: (row: ImportRow) => void;
}) {
  const room = row.room_payload ?? {};
  const detail = row.detail_payload ?? {};
  const batch = row.batch ?? {};
  const inherited = row.inherited_field_map ?? {};
  const source = row.source_field_map ?? {};
  const isDuplicate = row.status === "Trùng phòng";

    async function rejectImport() {
    const ok = window.confirm(
      "Bạn có chắc muốn từ chối import này? Ảnh tạm trên R2 sẽ bị xoá."
    );

    if (!ok) return;

    const reason = window.prompt("Lý do từ chối (có thể bỏ trống):") || "";

    const res = await fetch(`/api/admin/zalo-imports/${row.id}/reject`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json?.ok) {
      alert(json?.error || "Từ chối thất bại");
      return;
    }

    alert("Đã từ chối import.");
    onChanged?.();
  }

    async function deleteImport() {
    const ok = window.confirm(
      "Bạn có chắc muốn xoá hẳn import này? Dữ liệu pending và ảnh tạm R2 sẽ bị xoá."
    );

    if (!ok) return;

    const res = await fetch(`/api/admin/zalo-imports/${row.id}/remove`, {
      method: "POST",
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json?.ok) {
      alert(json?.error || "Xoá thất bại");
      return;
    }

    alert("Đã xoá import.");
    onChanged?.();
  }

     async function approveImport(mode: "create_room" | "update_status") {
    const text =
      mode === "update_status"
        ? "Xác nhận cập nhật trạng thái phòng đã tồn tại?"
        : "Xác nhận duyệt và tạo phòng mới?";

    const ok = window.confirm(text);
    if (!ok) return;

    const res = await fetch(`/api/admin/zalo-imports/${row.id}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json?.ok) {
      alert(json?.error || "Duyệt thất bại");
      return;
    }

    alert(
      mode === "update_status"
        ? "Đã cập nhật trạng thái phòng."
        : "Đã tạo phòng mới."
    );

    onChanged?.();

    if (json.roomId) {
      window.open(`/rooms/${json.roomId}`, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <section style={card}>
      <div style={cardHeader}>
        <div>
          <div style={statusLine}>
            <span style={isDuplicate ? badgeOrange : badgeBlue}>
              {row.status}
            </span>

            {row.confidence_score != null && (
              <span style={confidence}>
                Confidence: {Math.round(Number(row.confidence_score) * 100)}%
              </span>
            )}
          </div>

          <div style={meta}>
            Nhóm: <b>{batch.group_name || "-"}</b> · Người gửi:{" "}
            <b>{batch.sender_name || "-"}</b>
          </div>

          <div style={meta}>
            Thời gian: {formatDateTime(batch.sent_at || row.created_at)}
          </div>
        </div>

        {isDuplicate && row.matched_room_id && (
          <a
            href={`/rooms/${row.matched_room_id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={viewRoomBtn}
          >
            Xem phòng
          </a>
        )}
      </div>

      {isDuplicate && (
        <div style={duplicateBox}>
          <b>Phòng đã tồn tại</b>
          <div>Lý do: {row.matched_reason || "-"}</div>
          <div>
            Trạng thái cũ: <b>{row.old_status || "-"}</b> → Trạng thái mới:{" "}
            <b>{row.new_status || "-"}</b>
          </div>
        </div>
      )}

      <div style={grid}>
        <div style={panel}>
          <div style={panelTitle}>Tin gốc Zalo</div>
          <pre style={rawText}>{batch.raw_text || "-"}</pre>
        </div>

        <div style={panel}>
          <div style={panelTitle}>Dữ liệu phòng</div>

          <Field label="Mã phòng" value={room.room_code} field="room_code" source={source} inherited={inherited} />
          <Field label="Loại phòng" value={room.room_type} field="room_type" source={source} inherited={inherited} />
          <Field label="Số nhà" value={room.house_number} field="house_number" source={source} inherited={inherited} />
          <Field label="Đường" value={room.address} field="address" source={source} inherited={inherited} />
          <Field label="Phường" value={room.ward} field="ward" source={source} inherited={inherited} />
          <Field label="Quận" value={room.district} field="district" source={source} inherited={inherited} />
          <Field label="Giá" value={formatPrice(room.price)} field="price" source={source} inherited={inherited} />
          <Field label="Trạng thái" value={room.status} field="status" source={source} inherited={inherited} />
          <Field label="Zalo/Phone" value={room.zalo_phone || room.link_zalo} field="zalo_phone" source={source} inherited={inherited} />
          <Field label="Mô tả" value={room.description} field="description" source={source} inherited={inherited} />
          <Field label="Chính sách" value={room.chinh_sach} field="chinh_sach" source={source} inherited={inherited} />
        </div>

        <div style={panel}>
          <div style={panelTitle}>Chi phí / tiện ích</div>

          <Field label="Điện" value={formatFee(detail.electric_fee_value, detail.electric_fee_unit)} field="electric_fee_value" source={source} inherited={inherited} />
          <Field label="Nước" value={formatFee(detail.water_fee_value, detail.water_fee_unit)} field="water_fee_value" source={source} inherited={inherited} />
          <Field label="Dịch vụ" value={formatFee(detail.service_fee_value, detail.service_fee_unit)} field="service_fee_value" source={source} inherited={inherited} />
          <Field label="Giữ xe" value={formatFee(detail.parking_fee_value, detail.parking_fee_unit)} field="parking_fee_value" source={source} inherited={inherited} />
          <Field label="Các phí khác" value={formatOtherFee(detail.other_fee_value, detail.other_fee_note)} field={["other_fee_value", "other_fee_note"]} source={source} inherited={inherited} />

          <Field label="Các tiện ích khác" value={String(detail.other_amenities || "").trim()} field="other_amenities" source={source} inherited={inherited} />
          <Field label="Thang máy" value={detail.has_elevator ? "Có" : "Không"} field="has_elevator" source={source} inherited={inherited} />
          <Field label="Thang bộ" value={detail.has_stairs ? "Có" : "Không"} field="has_stairs" source={source} inherited={inherited} />
          <Field label="Khóa vân tay" value={detail.fingerprint_lock ? "Có" : "Không"} field="fingerprint_lock" source={source} inherited={inherited} />

          <Field label="Cho mèo" value={detail.allow_cat ? "Có" : "Không"} field="allow_cat" source={source} inherited={inherited} />
          <Field label="Cho chó" value={detail.allow_dog ? "Có" : "Không"} field="allow_dog" source={source} inherited={inherited} />
          <Field label="Không pet" value={detail.no_pet ? "Có" : "Không"} field="no_pet" source={source} inherited={inherited} />

          <Field label="Gửi xe" value={detail.has_parking ? "Có" : "Không"} field="has_parking" source={source} inherited={inherited} />
          <Field label="Hầm xe" value={detail.has_basement ? "Có" : "Không"} field="has_basement" source={source} inherited={inherited} />

          <Field label="Máy giặt riêng" value={detail.private_washer ? "Có" : "Không"} field="private_washer" source={source} inherited={inherited} />
          <Field label="Máy giặt chung" value={detail.shared_washer ? "Có" : "Không"} field="shared_washer" source={source} inherited={inherited} />
          <Field label="Máy sấy riêng" value={detail.private_dryer ? "Có" : "Không"} field="private_dryer" source={source} inherited={inherited} />
          <Field label="Máy sấy chung" value={detail.shared_dryer ? "Có" : "Không"} field="shared_dryer" source={source} inherited={inherited} />

          <Field label="Ngắn hạn" value={detail.short_term ? "Có" : "Không"} field="short_term" source={source} inherited={inherited} />
          <Field label="Dài hạn" value={detail.long_term ? "Có" : "Không"} field="long_term" source={source} inherited={inherited} />
        </div>
      </div>

      {Array.isArray(row.images) && row.images.length > 0 && (
        <div style={imagesWrap}>
          <div style={panelTitle}>Ảnh tạm</div>
          <div style={imagesGrid}>
            {row.images.map((img: any) => (
              <img
                key={img.id}
                src={img.temp_image_url}
                alt=""
                style={thumb}
              />
            ))}
          </div>
        </div>
      )}

      <div style={actions}>
        {isDuplicate ? (
            <>
            <button
                style={primaryBtn}
                type="button"
                onClick={() => approveImport("update_status")}
                disabled={row.status === "Đã duyệt" || row.status === "Từ chối"}
            >
                Duyệt cập nhật
            </button>

            <button
                style={ghostBtn}
                type="button"
                onClick={() => approveImport("create_room")}
                disabled={row.status === "Đã duyệt" || row.status === "Từ chối"}
            >
                Tạo phòng mới
            </button>
            </>
        ) : (
            <button
            style={primaryBtn}
            type="button"
            onClick={() => approveImport("create_room")}
            disabled={row.status === "Đã duyệt" || row.status === "Từ chối"}
            >
            Duyệt đăng
            </button>
        )}

        <button
            style={ghostBtn}
            type="button"
            onClick={() => onEdit?.(row)}
            disabled={row.status === "Đã duyệt" || row.status === "Từ chối"}
        >
            Chỉnh sửa
        </button>

                <button
            style={dangerBtn}
            type="button"
            onClick={rejectImport}
            disabled={row.status === "Đã duyệt" || row.status === "Từ chối"}
        >
            Từ chối
        </button>

        <button
            style={deleteBtn}
            type="button"
            onClick={deleteImport}
        >
            Xóa
        </button>
        </div>
    </section>
  );
}

function Field({
  label,
  value,
  field,
  source,
  inherited,
}: {
  label: string;
  value: any;

  /*
   * Cho phép một dòng giao diện đại diện cho nhiều field.
   *
   * Ví dụ "Các phí khác" gồm:
   * - other_fee_value
   * - other_fee_note
   */
  field: string | string[];

  source: Record<string, string>;
  inherited: Record<string, string>;
}) {
  const fieldNames =
    Array.isArray(field)
      ? field
      : [field];

  const inheritedField =
    fieldNames.find(
      (fieldName) =>
        Boolean(inherited[fieldName])
    );

  const sourceField =
    fieldNames.find(
      (fieldName) =>
        Boolean(source[fieldName])
    );

  const isInherited =
    Boolean(inheritedField);

  const tag =
    inheritedField
      ? inherited[inheritedField]
      : sourceField
        ? source[sourceField]
        : "";

  const hasValue =
    value !== null &&
    value !== undefined &&
    String(value).trim() !== "";

  return (
    <div style={fieldRow}>
      <div style={fieldLabel}>
        {label}
      </div>

      <div
        style={{
          ...fieldValue,

          /*
           * Hiển thị đúng các dòng xuống hàng trong:
           * - ghi chú phí;
           * - tiện ích khác.
           */
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        {hasValue ? value : "-"}
      </div>

      {tag && (
        <span
          style={
            isInherited
              ? tagInherited
              : tagSource
          }
        >
          {isInherited
            ? "Tự điền"
            : "Tin Zalo"}
        </span>
      )}
    </div>
  );
}

function formatPrice(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return `${n.toLocaleString("vi-VN")} đ`;
}

function formatFee(v: any, unit?: string) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return `${n.toLocaleString("vi-VN")} đ/${unit || ""}`;
}

function formatOtherFee(
  value: any,
  note: any
) {
  const amount =
    Number(value);

  const amountText =
    Number.isFinite(amount) &&
    amount > 0
      ? `${amount.toLocaleString(
          "vi-VN"
        )} đ`
      : "";

  const noteText =
    String(note || "").trim();

  /*
   * Ví dụ kết quả:
   *
   * 130.000 đ
   * Phí wifi: 50k
   * Phí giặt: 50k
   * Phí rác: 30k
   */
  return [
    amountText,
    noteText,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatDateTime(input?: string | null) {
  if (!input) return "-";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

const wrap: CSSProperties = {
  padding: 20,
  background: "#f3f4f6",
  minHeight: "100vh",
};

const topBar: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  marginBottom: 16,
};

const title: CSSProperties = {
  margin: 0,
  fontSize: 26,
  color: "#111827",
};

const subTitle: CSSProperties = {
  color: "#6b7280",
  fontSize: 14,
  marginTop: 4,
};

const backBtn: CSSProperties = {
  background: "#111827",
  color: "#fff",
  textDecoration: "none",
  padding: "10px 14px",
  borderRadius: 10,
  fontWeight: 600,
};

const filterBar: CSSProperties = {
  display: "flex",
  gap: 10,
  marginBottom: 16,
};

const select: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
};

const refreshBtn: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
};

const list: CSSProperties = {
  display: "grid",
  gap: 16,
};

const card: CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  border: "1px solid #e5e7eb",
  padding: 16,
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
};

const cardHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
};

const statusLine: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  marginBottom: 6,
};

const badgeBlue: CSSProperties = {
  background: "#eff6ff",
  color: "#1d4ed8",
  border: "1px solid #bfdbfe",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 13,
  fontWeight: 700,
};

const badgeOrange: CSSProperties = {
  background: "#fff7ed",
  color: "#c2410c",
  border: "1px solid #fed7aa",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 13,
  fontWeight: 700,
};

const confidence: CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
};

const meta: CSSProperties = {
  color: "#374151",
  fontSize: 14,
  marginTop: 2,
};

const viewRoomBtn: CSSProperties = {
  background: "#2563eb",
  color: "#fff",
  textDecoration: "none",
  padding: "9px 12px",
  borderRadius: 10,
  height: 38,
  fontWeight: 600,
};

const duplicateBox: CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#7c2d12",
  marginBottom: 12,
  lineHeight: 1.5,
};

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.2fr 1fr 1fr",
  gap: 12,
};

const panel: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 12,
  minWidth: 0,
};

const panelTitle: CSSProperties = {
  fontWeight: 700,
  color: "#111827",
  marginBottom: 10,
};

const rawText: CSSProperties = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  margin: 0,
  fontFamily: "inherit",
  fontSize: 14,
  color: "#111827",
  lineHeight: 1.5,
};

const fieldRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "92px 1fr auto",
  gap: 8,
  alignItems: "center",
  padding: "7px 0",
  borderBottom: "1px dashed #e5e7eb",
};

const fieldLabel: CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
};

const fieldValue: CSSProperties = {
  color: "#111827",
  fontSize: 14,
  minWidth: 0,
  wordBreak: "break-word",
};

const tagSource: CSSProperties = {
  background: "#ecfdf5",
  color: "#047857",
  border: "1px solid #a7f3d0",
  padding: "2px 6px",
  borderRadius: 999,
  fontSize: 11,
  whiteSpace: "nowrap",
};

const tagInherited: CSSProperties = {
  background: "#fefce8",
  color: "#a16207",
  border: "1px solid #fde68a",
  padding: "2px 6px",
  borderRadius: 999,
  fontSize: 11,
  whiteSpace: "nowrap",
};

const imagesWrap: CSSProperties = {
  marginTop: 12,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 12,
};

const imagesGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))",
  gap: 10,
};

const thumb: CSSProperties = {
  width: "100%",
  aspectRatio: "1 / 1",
  objectFit: "cover",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
};

const actions: CSSProperties = {
  display: "flex",
  gap: 10,
  justifyContent: "flex-end",
  marginTop: 14,
  borderTop: "1px solid #e5e7eb",
  paddingTop: 14,
};

const primaryBtn: CSSProperties = {
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
};

const ghostBtn: CSSProperties = {
  background: "#fff",
  color: "#111827",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 600,
  cursor: "pointer",
};

const dangerBtn: CSSProperties = {
  background: "#ef4444",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
};

const deleteBtn: CSSProperties = {
  background: "#7f1d1d",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
};

const errorBox: CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  marginBottom: 12,
};

const emptyBox: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 24,
  textAlign: "center",
  color: "#6b7280",
};

const pagination: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 16,
};

const pageBtn: CSSProperties = {
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
};

const muted: CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
};

const bulkDeleteBtn: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "#7f1d1d",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};