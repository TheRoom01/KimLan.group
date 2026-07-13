"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
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
  videos?: any[];
  import_quality?: any;
};

type CardBusyAction = "approve" | "delete" | "reject" | null;

const PAGE_SIZE = 20;

let bodyScrollLockCount = 0;
let bodyScrollPreviousOverflow = "";

function acquireBodyScrollLock() {
  if (typeof document === "undefined") {
    return () => {};
  }

  if (bodyScrollLockCount === 0) {
    bodyScrollPreviousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";
  }

  bodyScrollLockCount += 1;

  let released = false;

  return () => {
    if (released) return;

    released = true;
    bodyScrollLockCount = Math.max(
      0,
      bodyScrollLockCount - 1
    );

    if (bodyScrollLockCount === 0) {
      document.body.style.overflow =
        bodyScrollPreviousOverflow;

      bodyScrollPreviousOverflow = "";
    }
  };
}

function useBodyScrollLock(
  active = true
) {
  useEffect(() => {
    if (!active) return;

    return acquireBodyScrollLock();
  }, [active]);
}

export default function ZaloImportsClient() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [status, setStatus] = useState("Chờ duyệt");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  const [editingPending, setEditingPending] = useState<ImportRow | null>(null);
  const [detailPending, setDetailPending] = useState<ImportRow | null>(null);
  const [openPendingModal, setOpenPendingModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("info");

  function showToast(message: string, tone: "success" | "error" = "success") {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3200);
  }

  async function loadData(nextOffset = offset, nextStatus = status) {
    try {
      setLoading(true);
      setErrorMsg(null);

      const qs = new URLSearchParams();
      qs.set("limit", String(PAGE_SIZE));
      qs.set("offset", String(nextOffset));

      if (nextStatus) {
        qs.set("status", nextStatus);
      }

      const res = await fetch(`/api/admin/zalo-imports?${qs.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Load thất bại");
      }

      setRows(Array.isArray(json.data) ? json.data : []);
      setTotal(Number(json.total ?? 0));
    } catch (error: any) {
      setErrorMsg(error?.message ?? "Load thất bại");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setOffset(0);
    void loadData(0, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const page = useMemo(
    () => Math.floor(offset / PAGE_SIZE) + 1,
    [offset]
  );

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total]
  );

  function removeRowFromList(id: string) {
    setRows((currentRows) =>
      currentRows.filter((row) => row.id !== id)
    );

    setTotal((currentTotal) =>
      Math.max(0, currentTotal - 1)
    );

    if (editingPending?.id === id) {
      setEditingPending(null);
      setOpenPendingModal(false);
    }

    setDetailPending((current) =>
      current?.id === id
        ? null
        : current
    );
  }

  async function deleteAllCurrentRows() {
  if (rows.length === 0 || bulkDeleting) {
    return;
  }

  const ids = rows.map((row) => row.id);

  const ok = window.confirm(
    `Bạn có chắc muốn xoá tất cả ${ids.length} card đang hiển thị trên trang này? Ảnh tạm R2 cũng sẽ bị xoá.`
  );

  if (!ok) {
    return;
  }

  setBulkDeleting(true);

  try {
    const res = await fetch(
      "/api/admin/zalo-imports/bulk-remove",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids }),
      }
    );

    const json = await res
      .json()
      .catch(() => ({}));

    if (!res.ok || !json?.ok) {
      throw new Error(
        json?.error ||
          "Xoá tất cả thất bại"
      );
    }

    const deletedCount = Number(
      json.deleted ?? ids.length
    );

    /*
     * Tính lại tổng số phòng còn lại.
     */
    const remainingTotal =
      Math.max(
        0,
        total - deletedCount
      );

    /*
     * Nếu đang ở trang cuối và sau khi xóa
     * offset hiện tại không còn hợp lệ,
     * tự lùi về trang cuối còn dữ liệu.
     *
     * Ví dụ:
     * - Đang offset 40.
     * - Sau khi xóa chỉ còn 35 phòng.
     * - Tự chuyển về offset 20.
     */
    const lastValidOffset =
      remainingTotal > 0
        ? Math.floor(
            (remainingTotal - 1) /
              PAGE_SIZE
          ) * PAGE_SIZE
        : 0;

    const nextOffset =
      Math.min(
        offset,
        lastValidOffset
      );

    /*
     * Đóng các modal đang mở.
     */
    setEditingPending(null);
    setDetailPending(null);
    setOpenPendingModal(false);

    /*
     * Cập nhật trang hiện tại và gọi API
     * để tự tải 20 card tiếp theo.
     *
     * Nếu đang ở trang đầu:
     * - Xóa 20 phòng đầu.
     * - Load lại offset 0.
     * - 20 phòng tiếp theo tự xuất hiện.
     */
    setOffset(nextOffset);

    await loadData(
      nextOffset,
      status
    );

    showToast(
      `Đã xoá ${deletedCount} phòng. Danh sách đã được tải lại.`,
      "success"
    );
  } catch (error: any) {
    showToast(
      error?.message ||
        "Xoá tất cả thất bại",
      "error"
    );
  } finally {
    setBulkDeleting(false);
  }
}

  return (
    <main style={wrap}>
      <div style={topBar}>
        <div>
          <h1 style={title}>Zalo Imports</h1>
          <div style={subTitle}>
            Tin phòng tự động đọc từ nhóm Zalo
          </div>
        </div>

        <a href="/admin" style={backBtn}>
          ← Quay lại Admin
        </a>
      </div>

      <div style={filterBar}>
        <select
          value={status}
          onChange={(event) =>
            setStatus(event.target.value)
          }
          style={select}
        >
          <option value="">Tất cả</option>
          <option value="Chờ duyệt">Chờ duyệt</option>
          <option value="Trùng phòng">Trùng phòng</option>
          <option value="Đã duyệt">Đã duyệt</option>
          <option value="Từ chối">Từ chối</option>
          <option value="Hết hạn">Hết hạn</option>
        </select>

        <button
          type="button"
          onClick={() =>
            void loadData(offset, status)
          }
          style={refreshBtn}
          disabled={loading}
        >
          {loading && rows.length > 0
            ? "Đang tải..."
            : "Tải lại"}
        </button>

        <button
          type="button"
          onClick={() =>
            void deleteAllCurrentRows()
          }
          style={bulkDeleteBtn}
          disabled={
            bulkDeleting ||
            loading ||
            rows.length === 0
          }
        >
          {bulkDeleting
            ? "Đang xóa..."
            : "Xóa tất cả phòng"}
        </button>
      </div>

      {errorMsg && (
        <div style={errorBox}>
          {errorMsg}
        </div>
      )}

      <div style={pagination}>
        <button
          type="button"
          style={pageBtn}
          disabled={offset <= 0 || loading}
          onClick={() => {
            const next = Math.max(
              0,
              offset - PAGE_SIZE
            );

            setOffset(next);
            void loadData(next, status);
          }}
        >
          ← Trước
        </button>

        <div style={muted}>
          Trang <b>{page}</b> /{" "}
          <b>{totalPages}</b> · Tổng{" "}
          <b>{total}</b>
        </div>

        <button
          type="button"
          style={pageBtn}
          disabled={
            offset + PAGE_SIZE >= total ||
            loading
          }
          onClick={() => {
            const next = offset + PAGE_SIZE;

            setOffset(next);
            void loadData(next, status);
          }}
        >
          Sau →
        </button>
      </div>

      {/*
       * Chỉ hiện trạng thái tải toàn màn hình ở lần mở đầu tiên.
       * Khi refresh nền, danh sách cũ vẫn được giữ nguyên.
       */}
      {loading && rows.length === 0 ? (
        <div style={emptyBox}>Đang tải...</div>
      ) : rows.length === 0 ? (
        <div style={emptyBox}>
          Chưa có import nào.
        </div>
      ) : (
        <div style={list}>
          {rows.map((row) => (
            <ImportCard
              key={row.id}
              row={row}
              onRemoved={removeRowFromList}
              onViewDetail={(selectedRow) =>
                setDetailPending(selectedRow)
              }
              onEdit={(selectedRow) => {
                setDetailPending(null);
                setEditingPending(selectedRow);
                setActiveTab("info");
                setOpenPendingModal(true);
              }}
            />
          ))}
        </div>
      )}


      {detailPending && (
        <ImportDetailModal
          row={detailPending}
          onClose={() =>
            setDetailPending(null)
          }
          onRemoved={removeRowFromList}
          onUpdated={(updatedRow) => {
            setRows((currentRows) =>
              currentRows.map((item) =>
                item.id === updatedRow.id
                  ? updatedRow
                  : item
              )
            );

            setDetailPending(updatedRow);
          }}
          onEdit={(selectedRow) => {
            setDetailPending(null);
            setEditingPending(selectedRow);
            setActiveTab("info");
            setOpenPendingModal(true);
          }}
        />
      )}

      {toast && (
        <div
          style={{
            ...toastBox,
            background:
              toast.tone === "success"
                ? "#ecfdf5"
                : "#fef2f2",
            color:
              toast.tone === "success"
                ? "#047857"
                : "#b91c1c",
            borderColor:
              toast.tone === "success"
                ? "#a7f3d0"
                : "#fecaca",
          }}
        >
          {toast.message}
        </div>
      )}

      {openPendingModal && editingPending && (
        <RoomModal
          mode="pending"
          pendingId={editingPending.id}
          pendingRoomPayload={
            editingPending.room_payload ?? {}
          }
          pendingDetailPayload={
            editingPending.detail_payload ?? {}
          }
          pendingImages={editingPending.images ?? []}
          open={openPendingModal}
          onClose={() =>
            setOpenPendingModal(false)
          }
          editingRoom={null}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onNotify={(message: string) =>
            showToast(message, "success")
          }
          onPendingSaved={async (updated: any) => {
            setRows((currentRows) =>
              currentRows.map((row) =>
                row.id === editingPending.id
                  ? {
                      ...row,
                      room_payload:
                        updated?.room_payload ?? row.room_payload,
                      detail_payload:
                        updated?.detail_payload ?? row.detail_payload,
                      images:
                        updated?.images ?? row.images,
                    }
                  : row
              )
            );
          }}
          onSaved={async () => {}}
        />
      )}

      <style>{`
        .zalo-import-compact-main {
          display: grid;
          grid-template-columns: minmax(250px, 0.9fr) minmax(330px, 1.1fr);
          gap: 16px;
        }

        .zalo-import-summary-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .zalo-import-detail-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr 1fr;
          gap: 12px;
        }

        .zalo-import-card-actions,
        .zalo-import-modal-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: flex-end;
        }

        .zalo-import-card-actions button,
        .zalo-import-modal-actions button {
          min-height: 42px;
        }

        .zalo-import-thumbnail-strip::-webkit-scrollbar {
          height: 6px;
        }

        .zalo-import-thumbnail-strip::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.6);
          border-radius: 999px;
        }

        @media (max-width: 980px) {
          .zalo-import-detail-grid {
            grid-template-columns: 1fr;
          }

          .zalo-import-detail-panel {
            max-height: none !important;
          }
        }

        @media (max-width: 760px) {
          .zalo-import-compact-main {
            grid-template-columns: 1fr;
          }

          .zalo-import-summary-grid {
            grid-template-columns: 1fr;
          }

          .zalo-import-card-actions,
          .zalo-import-modal-actions {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            width: 100%;
          }

          .zalo-import-card-actions button,
          .zalo-import-modal-actions button {
            width: 100%;
          }

          .zalo-import-modal-shell {
            width: calc(100vw - 12px) !important;
            max-height: calc(100dvh - 12px) !important;
            border-radius: 14px !important;
          }

          .zalo-import-modal-header,
          .zalo-import-modal-body,
          .zalo-import-modal-footer {
            padding-left: 14px !important;
            padding-right: 14px !important;
          }

          .zalo-import-notice-badge {
            max-width: 100%;
            min-width: 0;
          }

          .zalo-import-notice-modal-shell {
            width: calc(100vw - 12px) !important;
            max-height: calc(100dvh - 12px) !important;
            border-radius: 14px !important;
          }

          .zalo-import-notice-modal-header {
            padding: 13px 14px !important;
          }

          .zalo-import-notice-modal-body {
            padding: 10px !important;
          }

          .zalo-import-detail-panel {
            overscroll-behavior-y: auto !important;
          }

          .zalo-import-reparse-actions {
            display: grid !important;
            grid-template-columns: 1fr !important;
          }

          .zalo-import-reparse-actions button {
            width: 100% !important;
          }

          .zalo-import-reparse-textarea {
            min-height: 320px !important;
            font-size: 16px !important;
          }
        }
      `}</style>
    </main>
  );
}

function useImportActions({
  row,
  onRemoved,
  onAfterRemoved,
}: {
  row: ImportRow;
  onRemoved?: (id: string) => void;
  onAfterRemoved?: () => void;
}) {
  const [busyAction, setBusyAction] =
    useState<CardBusyAction>(null);

  const isLockedStatus =
    row.status === "Đã duyệt" ||
    row.status === "Từ chối";

  const actionDisabled =
    busyAction !== null ||
    isLockedStatus;

  function finishRemoved() {
    onAfterRemoved?.();
    onRemoved?.(row.id);
  }

  async function rejectImport() {
    if (busyAction) return;

    const ok = window.confirm(
      "Bạn có chắc muốn từ chối import này? Ảnh tạm trên R2 sẽ bị xoá."
    );

    if (!ok) return;

    const reason =
      window.prompt(
        "Lý do từ chối (có thể bỏ trống):"
      ) || "";

    setBusyAction("reject");

    try {
      const res = await fetch(
        `/api/admin/zalo-imports/${row.id}/reject`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reason }),
        }
      );

      const json = await res
        .json()
        .catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(
          json?.error || "Từ chối thất bại"
        );
      }

      finishRemoved();
    } catch (error: any) {
      alert(
        error?.message || "Từ chối thất bại"
      );
      setBusyAction(null);
    }
  }

  async function deleteImport() {
    if (busyAction) return;

    const ok = window.confirm(
      "Bạn có chắc muốn xoá hẳn import này? Dữ liệu pending và ảnh tạm R2 sẽ bị xoá."
    );

    if (!ok) return;

    setBusyAction("delete");

    try {
      const res = await fetch(
        `/api/admin/zalo-imports/${row.id}/remove`,
        {
          method: "POST",
        }
      );

      const json = await res
        .json()
        .catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(
          json?.error || "Xoá thất bại"
        );
      }

      finishRemoved();
    } catch (error: any) {
      alert(
        error?.message || "Xoá thất bại"
      );
      setBusyAction(null);
    }
  }

  async function approveImport(
    mode: "create_room" | "update_status"
  ) {
    if (busyAction) return;

    const confirmText =
      mode === "update_status"
        ? "Xác nhận cập nhật trạng thái phòng đã tồn tại?"
        : "Xác nhận duyệt và tạo phòng mới?";

    const ok =
      window.confirm(confirmText);

    if (!ok) return;

    setBusyAction("approve");

    try {
      const res = await fetch(
        `/api/admin/zalo-imports/${row.id}/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ mode }),
        }
      );

      const json = await res
        .json()
        .catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(
          json?.error || "Duyệt thất bại"
        );
      }

      finishRemoved();
    } catch (error: any) {
      alert(
        error?.message || "Duyệt thất bại"
      );
      setBusyAction(null);
    }
  }

  return {
    busyAction,
    actionDisabled,
    approveImport,
    rejectImport,
    deleteImport,
  };
}

function getImportImageUrl(
  image: any
) {
  return String(
    image?.temp_image_url ||
      image?.image_url ||
      image?.url ||
      image?.src ||
      ""
  ).trim();
}

function getImportImages(
  row: ImportRow
) {
  if (!Array.isArray(row.images)) {
    return [];
  }

  return row.images
    .map((image, index) => ({
      id:
        String(image?.id || "").trim() ||
        `image-${index}`,
      url: getImportImageUrl(image),
    }))
    .filter((image) => Boolean(image.url));
}

function getImportVideos(
  row: ImportRow
) {
  if (!Array.isArray(row.videos)) {
    return [];
  }

  return row.videos
    .map((video, index) => ({
      id:
        String(video?.id || "").trim() ||
        `video-${index}`,

      url: String(
        video?.temp_video_url ||
          video?.video_url ||
          video?.url ||
          ""
      ).trim(),

      thumb: String(
        video?.temp_thumb_url ||
          video?.thumb_url ||
          video?.thumbnail_url ||
          ""
      ).trim(),
    }))
    .filter((video) => Boolean(video.url));
}

function getImportQuality(
  row: ImportRow
) {
  const direct =
    row.import_quality;

  const roomQuality =
    row.room_payload?.import_quality;

  const batchQuality =
    row.batch &&
    (row.batch as any)
      ?.parser_result
      ?.import_quality;

  const quality =
    direct ||
    roomQuality ||
    batchQuality ||
    null;

  return quality &&
    typeof quality === "object"
      ? quality
      : null;
}

function getQualityScore(
  row: ImportRow
) {
  const quality =
    getImportQuality(row);

  const qualityScore = Number(
    quality?.score
  );

  if (
    Number.isFinite(
      qualityScore
    )
  ) {
    return Math.max(
      0,
      Math.min(
        100,
        Math.round(
          qualityScore
        )
      )
    );
  }

  const oldScore = Number(
    row.confidence_score
  );

  if (
    Number.isFinite(oldScore)
  ) {
    return Math.max(
      0,
      Math.min(
        100,
        Math.round(
          oldScore * 100
        )
      )
    );
  }

  return null;
}

function getQualityBreakdownItems(
  row: ImportRow
) {
  const breakdown =
    getImportQuality(row)
      ?.breakdown;

  if (
    !breakdown ||
    typeof breakdown !== "object"
  ) {
    return [];
  }

  return Object.entries(
    breakdown
  )
    .map(
      ([key, rawItem]) => {
        const item =
          rawItem as any;

        const score = Number(
          item?.score
        );

        const max = Number(
          item?.max
        );

        return {
          key,
          label: String(
            item?.label || key
          ),
          score:
            Number.isFinite(score)
              ? score
              : 0,
          max:
            Number.isFinite(max)
              ? max
              : 0,
          reason: String(
            item?.reason || ""
          ),
        };
      }
    )
    .filter(
      (item) =>
        item.max > 0
    );
}

function formatCompactWard(
  input: any
) {
  const value =
    String(input || "").trim();

  if (!value) return "";

  if (/^\d{1,2}$/.test(value)) {
    return `P${Number(value)}`;
  }

  if (/^(?:p\.?|phường)\s*/i.test(value)) {
    return value;
  }

  return value;
}

function getCompactLocation(
  room: any
) {
  const street = [
    room?.house_number,
    room?.address,
  ]
    .map((value) =>
      String(value || "").trim()
    )
    .filter(Boolean)
    .join(" ");

  return [
    street,
    formatCompactWard(room?.ward),
    String(room?.district || "").trim(),
  ]
    .filter(Boolean)
    .join(", ") || "Chưa có địa chỉ";
}

function getCompactArea(
  room: any,
  detail: any
) {
  const candidates = [
    room?.area_m2,
    room?.area,
    room?.dien_tich,
    room?.size_m2,
    detail?.area_m2,
    detail?.area,
    detail?.dien_tich,
  ];

  const found = candidates.find(
    (value) =>
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
  );

  if (
    found === null ||
    found === undefined ||
    String(found).trim() === ""
  ) {
    return "-";
  }

  const text = String(found).trim();

  if (/m(?:2|²)/i.test(text)) {
    return text;
  }

  return `${text}m²`;
}

function buildParserWarnings(
  row: ImportRow
) {
  const room =
    row.room_payload ?? {};

  const quality =
    getImportQuality(row);

  const warningTexts: string[] = [];

  if (quality) {
    const blockers =
      Array.isArray(
        quality.blockers
      )
        ? quality.blockers
        : [];

    const qualityWarnings =
      Array.isArray(
        quality.warnings
      )
        ? quality.warnings
        : [];

    for (const blocker of blockers) {
      const message =
        typeof blocker === "string"
          ? blocker
          : String(
              blocker?.message ||
                blocker?.code ||
                ""
            ).trim();

      if (message) {
        warningTexts.push(message);
      }
    }

    for (const warning of qualityWarnings) {
      const message =
        typeof warning === "string"
          ? warning
          : String(
              warning?.message ||
                warning?.code ||
                ""
            ).trim();

      if (message) {
        warningTexts.push(message);
      }
    }
  } else {
    if (!String(room.room_code || "").trim()) {
      warningTexts.push("Thiếu mã phòng");
    }

    if (
      !String(room.house_number || "").trim() &&
      !String(room.address || "").trim()
    ) {
      warningTexts.push("Thiếu địa chỉ");
    } else if (
      !String(room.address || "").trim()
    ) {
      warningTexts.push("Thiếu tên đường");
    }

    const price = Number(room.price);

    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      warningTexts.push("Thiếu giá phòng");
    }

    if (
      getImportImages(row).length === 0 &&
      getImportVideos(row).length === 0
    ) {
      warningTexts.push("Không có ảnh/video");
    }
  }

  const rawRow = row as any;

  const externalWarnings = [
    rawRow.parser_warnings,
    rawRow.reader_issues,
    rawRow.import_errors,
    rawRow.issues,
  ];

  for (const group of externalWarnings) {
    if (!Array.isArray(group)) continue;

    for (const item of group) {
      const message =
        typeof item === "string"
          ? item
          : String(
              item?.message ||
                item?.error ||
                item?.reason ||
                ""
            ).trim();

      if (message) {
        warningTexts.push(message);
      }
    }
  }

  return Array.from(
    new Set(
      warningTexts
        .map((warning) => warning.trim())
        .filter(Boolean)
    )
  );
}


function getNoticeMessage(
  item: any
) {
  if (typeof item === "string") {
    return item.trim();
  }

  return String(
    item?.message ||
      item?.error ||
      item?.reason ||
      item?.code ||
      ""
  ).trim();
}


function getEditableReparseText(
  row: ImportRow
) {
  return String(
    row.room_payload
      ?._manual_reparse
      ?.source_text ||
      row.batch?.raw_text ||
      ""
  );
}

function ImportNoticeBadge({
  row,
  onClick,
}: {
  row: ImportRow;
  onClick: () => void;
}) {
  const quality =
    getImportQuality(row);

  const score =
    getQualityScore(row);

  const warnings =
    buildParserWarnings(row);

  const hasIssues =
    warnings.length > 0 ||
    Boolean(
      quality &&
      !quality.eligible
    );

  const scoreText =
    score != null
      ? quality
        ? `${score}/100`
        : `${score}%`
      : "";

  const label =
    hasIssues
      ? [
          `⚠ ${Math.max(
            1,
            warnings.length
          )} thông báo`,
          scoreText,
        ]
          .filter(Boolean)
          .join(" · ")
      : scoreText
        ? `✓ Điểm ${scoreText}`
        : "✓ Không có cảnh báo";

  return (
    <button
      type="button"
      className="zalo-import-notice-badge"
      onClick={onClick}
      style={{
        ...compactNoticeBadgeButton,
        ...(hasIssues
          ? compactNoticeBadgeWarning
          : compactNoticeBadgeSuccess),
      }}
      title="Bấm để xem cảnh báo và điểm chất lượng"
      aria-label="Xem cảnh báo và điểm chất lượng"
    >
      {label}
    </button>
  );
}

function ImportCard({
  row,
  onRemoved,
  onEdit,
  onViewDetail,
}: {
  row: ImportRow;
  onRemoved?: (id: string) => void;
  onEdit?: (row: ImportRow) => void;
  onViewDetail?: (row: ImportRow) => void;
}) {
  const [activeImageIndex, setActiveImageIndex] =
    useState(0);

  const [
    openNoticeModal,
    setOpenNoticeModal,
  ] = useState(false);

  const room = row.room_payload ?? {};
  const detail = row.detail_payload ?? {};
  const batch = row.batch ?? {};
  const images = getImportImages(row);
  const videos = getImportVideos(row);

  const {
    busyAction,
    actionDisabled,
    approveImport,
    rejectImport,
    deleteImport,
  } = useImportActions({
    row,
    onRemoved,
  });

  const isDuplicate =
    row.status === "Trùng phòng";

  useEffect(() => {
    setActiveImageIndex(0);
  }, [row.id, images.length]);

  const safeImageIndex =
    images.length > 0
      ? Math.min(
          activeImageIndex,
          images.length - 1
        )
      : 0;

  const activeImage =
    images[safeImageIndex] || null;

  function moveImage(direction: -1 | 1) {
    if (images.length <= 1) return;

    setActiveImageIndex((current) => {
      const next =
        current + direction;

      if (next < 0) {
        return images.length - 1;
      }

      if (next >= images.length) {
        return 0;
      }

      return next;
    });
  }

  return (
    <section
      style={{
        ...card,
        ...compactCard,
        opacity: busyAction ? 0.72 : 1,
        transition:
          "opacity 160ms ease, transform 160ms ease",
      }}
    >
      <div className="zalo-import-compact-main">
        <div style={compactMediaColumn}>
          <div style={compactImageFrame}>
            {activeImage ? (
              <img
                src={activeImage.url}
                alt={`Ảnh phòng ${room.room_code || ""}`}
                style={compactMainImage}
              />
            ) : (
              <div style={compactImageEmpty}>
                Chưa có ảnh
              </div>
            )}

            <div style={compactImageGroupBadge}>
              📷 Zalo: {batch.group_name || "-"}
            </div>

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Ảnh trước"
                  onClick={() => moveImage(-1)}
                  style={{
                    ...compactImageArrow,
                    left: 10,
                  }}
                >
                  ‹
                </button>

                <button
                  type="button"
                  aria-label="Ảnh sau"
                  onClick={() => moveImage(1)}
                  style={{
                    ...compactImageArrow,
                    right: 10,
                  }}
                >
                  ›
                </button>
              </>
            )}

            <div style={compactImageCaption}>
              <div>
                Tin gửi: {formatDateTime(
                  batch.sent_at
                )}
              </div>
            </div>
          </div>

          {images.length > 0 && (
            <div
              className="zalo-import-thumbnail-strip"
              style={compactThumbnailStrip}
            >
              {images.map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() =>
                    setActiveImageIndex(index)
                  }
                  style={{
                    ...compactThumbnailButton,
                    borderColor:
                      index === safeImageIndex
                        ? "#38bdf8"
                        : "rgba(255,255,255,0.24)",
                    boxShadow:
                      index === safeImageIndex
                        ? "0 0 0 2px rgba(56,189,248,0.24)"
                        : "none",
                  }}
                >
                  <img
                    src={image.url}
                    alt=""
                    style={compactThumbnailImage}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={compactSummaryColumn}>
          <div style={compactSummaryTopLine}>
            <div style={statusLine}>
              <span
                style={
                  isDuplicate
                    ? badgeOrange
                    : compactStatusBadge
                }
              >
                {row.status}
              </span>

              <ImportNoticeBadge
                row={row}
                onClick={() =>
                  setOpenNoticeModal(true)
                }
              />
            </div>

            {isDuplicate &&
              row.matched_room_id && (
                <a
                  href={`/rooms/${row.matched_room_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={compactViewRoomBtn}
                >
                  Xem phòng
                </a>
              )}
          </div>

          <div style={compactInfoBlock}>
            <div style={compactInfoLabel}>
              Vị trí
            </div>
            <div style={compactLocationValue}>
              {getCompactLocation(room)}
            </div>
          </div>

          <div className="zalo-import-summary-grid">
            <CompactInfo
              label="Mã phòng"
              value={room.room_code || "-"}
              accent
            />
            <CompactInfo
              label="Giá"
              value={formatPrice(room.price)}
            />
            <CompactInfo
              label="Loại phòng"
              value={room.room_type || "-"}
            />
            <CompactInfo
              label="Diện tích"
              value={getCompactArea(
                room,
                detail
              )}
            />
          </div>

          {isDuplicate && (
            <div style={compactDuplicateBox}>
              <b>Phòng đã tồn tại</b>
              <div>
                {row.matched_reason || "-"}
              </div>
              <div>
                {row.old_status || "-"} → {row.new_status || "-"}
              </div>
            </div>
          )}

          <div style={compactMetaLine}>
            <span>
              Người gửi: <b>{batch.sender_name || "-"}</b>
            </span>
            
            <span>
              Media: <b>{images.length} ảnh · {videos.length} video</b>
            </span>

            <span>
              Đã import: <b>{formatDateTime(row.created_at)}</b>
            </span>
          </div>
        </div>
      </div>

      <div
        className="zalo-import-card-actions"
        style={compactActionsBar}
      >
        <button
          style={compactDeleteBtn}
          type="button"
          onClick={() =>
            void deleteImport()
          }
          disabled={busyAction !== null}
        >
          {busyAction === "delete"
            ? "Đang xóa..."
            : "Xóa"}
        </button>

        <button
          style={compactDetailBtn}
          type="button"
          onClick={() =>
            onViewDetail?.(row)
          }
          disabled={busyAction !== null}
        >
          Mở rộng chi tiết
        </button>

        <button
          style={compactRejectBtn}
          type="button"
          onClick={() =>
            void rejectImport()
          }
          disabled={actionDisabled}
        >
          {busyAction === "reject"
            ? "Đang từ chối..."
            : "Từ chối"}
        </button>

        <button
          style={compactEditBtn}
          type="button"
          onClick={() =>
            onEdit?.(row)
          }
          disabled={actionDisabled}
        >
          Chỉnh sửa
        </button>

        {isDuplicate ? (
          <>
            <button
              style={compactPrimaryBtn}
              type="button"
              onClick={() =>
                void approveImport(
                  "update_status"
                )
              }
              disabled={actionDisabled}
            >
              {busyAction === "approve"
                ? "Đang duyệt..."
                : "Duyệt cập nhật"}
            </button>

            <button
              style={compactCreateBtn}
              type="button"
              onClick={() =>
                void approveImport(
                  "create_room"
                )
              }
              disabled={actionDisabled}
            >
              Tạo phòng mới
            </button>
          </>
        ) : (
          <button
            style={compactPrimaryBtn}
            type="button"
            onClick={() =>
              void approveImport(
                "create_room"
              )
            }
            disabled={actionDisabled}
          >
            {busyAction === "approve"
              ? "Đang duyệt..."
              : "Duyệt đăng"}
          </button>
        )}
      </div>

      {openNoticeModal && (
        <ImportNoticeModal
          row={row}
          onClose={() =>
            setOpenNoticeModal(false)
          }
        />
      )}
    </section>
  );
}

function CompactInfo({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: any;
  accent?: boolean;
}) {
  return (
    <div style={compactInfoBlock}>
      <div style={compactInfoLabel}>
        {label}
      </div>
      <div
        style={
          accent
            ? compactAccentValue
            : compactInfoValue
        }
      >
        {value ?? "-"}
      </div>
    </div>
  );
}

function ImportDetailModal({
  row,
  onClose,
  onRemoved,
  onUpdated,
  onEdit,
}: {
  row: ImportRow;
  onClose: () => void;
  onRemoved?: (id: string) => void;
  onUpdated?: (row: ImportRow) => void;
  onEdit?: (row: ImportRow) => void;
}) {
  const [
    currentRow,
    setCurrentRow,
  ] = useState<ImportRow>(row);

  const [
    editableSourceText,
    setEditableSourceText,
  ] = useState(
    getEditableReparseText(row)
  );

  const [
    reparsing,
    setReparsing,
  ] = useState(false);

  const [
    reparseError,
    setReparseError,
  ] = useState("");

  const [
    reparseSuccess,
    setReparseSuccess,
  ] = useState("");

  const room =
    currentRow.room_payload ?? {};

  const detail =
    currentRow.detail_payload ?? {};

  const batch =
    currentRow.batch ?? {};

  const inherited =
    currentRow.inherited_field_map ?? {};

  const source =
    currentRow.source_field_map ?? {};

  const images =
    getImportImages(currentRow);

  const videos =
    getImportVideos(currentRow);

  const [
    openNoticeModal,
    setOpenNoticeModal,
  ] = useState(false);

  const isDuplicate =
    currentRow.status ===
    "Trùng phòng";

  const {
    busyAction,
    actionDisabled,
    approveImport,
    rejectImport,
    deleteImport,
  } = useImportActions({
    row: currentRow,
    onRemoved,
    onAfterRemoved: onClose,
  });

  useEffect(() => {
    setCurrentRow(row);
    setEditableSourceText(
      getEditableReparseText(row)
    );
    setReparseError("");
    setReparseSuccess("");
  }, [row.id]);

  async function reparsePending() {
    if (
      reparsing ||
      busyAction
    ) {
      return;
    }

    const sourceText =
      editableSourceText.trim();

    if (!sourceText) {
      setReparseSuccess("");
      setReparseError(
        "Hãy dán thông tin của đúng một tòa nhà và một phòng."
      );
      return;
    }

    setReparsing(true);
    setReparseError("");
    setReparseSuccess("");

    try {
      const response =
        await fetch(
          `/api/admin/zalo-imports/${currentRow.id}/reparse`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              sourceText,
            }),
          }
        );

      const json =
        await response
          .json()
          .catch(() => ({}));

      if (
        !response.ok ||
        !json?.ok ||
        !json?.data
      ) {
        const candidateText =
          Array.isArray(
            json?.candidates
          ) &&
          json.candidates.length > 0
            ? ` Các địa chỉ phát hiện: ${json.candidates
                .map(
                  (item: any) =>
                    item?.label ||
                    [
                      item?.houseNumber,
                      item?.address,
                      item?.district,
                    ]
                      .filter(Boolean)
                      .join(" ")
                )
                .filter(Boolean)
                .join(" | ")}`
            : "";

        throw new Error(
          `${
            json?.error ||
            "Phân tích lại thất bại."
          }${candidateText}`
        );
      }

      const updatedRow =
        json.data as ImportRow;

      setCurrentRow(
        updatedRow
      );

      setEditableSourceText(
        getEditableReparseText(
          updatedRow
        )
      );

      setReparseSuccess(
        json?.message ||
        "Đã phân tích lại dữ liệu và giữ nguyên media."
      );

      onUpdated?.(
        updatedRow
      );
    } catch (error: any) {
      setReparseError(
        error?.message ||
        "Phân tích lại dữ liệu thất bại."
      );
    } finally {
      setReparsing(false);
    }
  }

  function restoreOriginalText() {
    setEditableSourceText(
      String(
        batch.raw_text || ""
      )
    );

    setReparseError("");
    setReparseSuccess(
      "Đã đưa nội dung tin Zalo gốc trở lại vùng nhập. Bấm Phân tích lại để áp dụng."
    );
  }

  useBodyScrollLock(true);

  useEffect(() => {
    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (
        event.key === "Escape" &&
        !openNoticeModal
      ) {
        onClose();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    onClose,
    openNoticeModal,
  ]);

  return (
    <div
      style={detailModalOverlay}
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="zalo-import-modal-shell"
        style={{
          ...detailModalShell,
          opacity: busyAction || reparsing ? 0.82 : 1,
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết Zalo Import"
      >
        <header
          className="zalo-import-modal-header"
          style={detailModalHeader}
        >
          <div style={{ minWidth: 0 }}>
            <div style={statusLine}>
              <span
                style={
                  isDuplicate
                    ? badgeOrange
                    : badgeBlue
                }
              >
                {currentRow.status}
              </span>

              <ImportNoticeBadge
                row={currentRow}
                onClick={() =>
                  setOpenNoticeModal(true)
                }
              />
            </div>

            <div style={meta}>
              Nhóm: <b>{batch.group_name || "-"}</b>
              {" · "}
              Người gửi: <b>{batch.sender_name || "-"}</b>
            </div>

            <div style={meta}>
              Tin gửi trong nhóm: {formatDateTime(
                batch.sent_at
              )}
            </div>

            <div style={meta}>
              Đã import lên Pending: {formatDateTime(
                row.created_at
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={detailModalCloseBtn}
            aria-label="Đóng"
          >
            ×
          </button>
        </header>

        <div
          className="zalo-import-modal-body"
          style={detailModalBody}
        >
          {isDuplicate && (
            <div style={duplicateBox}>
              <b>Phòng đã tồn tại</b>
              <div>
                Lý do: {row.matched_reason || "-"}
              </div>
              <div>
                Trạng thái cũ: <b>{row.old_status || "-"}</b>
                {" → "}
                Trạng thái mới: <b>{row.new_status || "-"}</b>
              </div>
            </div>
          )}

          <div className="zalo-import-detail-grid">
            <div
              className="zalo-import-detail-panel"
              style={panel}
            >
              <div style={reparsePanelHeader}>
                <div>
                  <div style={panelTitle}>
                    Thông tin đúng để parser đọc lại
                  </div>

                  <div style={reparseHelpText}>
                    Chỉ giữ thông tin của đúng một tòa nhà và một phòng phù hợp với ảnh bên dưới.
                  </div>
                </div>

                {room?._manual_reparse
                  ?.reparsed_at && (
                  <span style={manualReparseBadge}>
                    Đã sửa thủ công
                  </span>
                )}
              </div>

              <textarea
                value={editableSourceText}
                onChange={(event) => {
                  setEditableSourceText(
                    event.target.value
                  );
                  setReparseError("");
                  setReparseSuccess("");
                }}
                className="zalo-import-reparse-textarea"
                style={reparseTextarea}
                placeholder={[
                  "Ví dụ:",
                  "Địa chỉ: 202/6/15 Lý Thường Kiệt P14 Q10",
                  "Điện 4k, nước 100k/người, dịch vụ 150k/phòng",
                  "",
                  "Phòng 302",
                  "Giá 7tr",
                  "Loại phòng Duplex",
                ].join("\\n")}
                disabled={
                  reparsing ||
                  busyAction !== null
                }
              />

              <div
                className="zalo-import-reparse-actions"
                style={reparseActions}
              >
                <button
                  type="button"
                  style={reparseRestoreBtn}
                  onClick={restoreOriginalText}
                  disabled={
                    reparsing ||
                    busyAction !== null ||
                    !batch.raw_text
                  }
                >
                  Khôi phục tin gốc
                </button>

                <button
                  type="button"
                  style={reparsePrimaryBtn}
                  onClick={() =>
                    void reparsePending()
                  }
                  disabled={
                    reparsing ||
                    busyAction !== null ||
                    !editableSourceText.trim()
                  }
                >
                  {reparsing
                    ? "Đang phân tích..."
                    : "Phân tích lại dữ liệu"}
                </button>
              </div>

              {reparseError && (
                <div style={reparseErrorBox}>
                  {reparseError}
                </div>
              )}

              {reparseSuccess && (
                <div style={reparseSuccessBox}>
                  {reparseSuccess}
                </div>
              )}

              <div style={reparseFootnote}>
                Tin Zalo gốc vẫn được giữ trong batch để đối chiếu. Thao tác này không xóa hoặc thay đổi ảnh/video.
              </div>
            </div>

            <div
              className="zalo-import-detail-panel"
              style={panel}
            >
              <div style={panelTitle}>
                Dữ liệu phòng
              </div>

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

            <div
              className="zalo-import-detail-panel"
              style={panel}
            >
              <div style={panelTitle}>
                Chi phí / tiện ích
              </div>

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

          {images.length > 0 && (
            <div style={imagesWrap}>
              <div style={panelTitle}>
                Ảnh tạm ({images.length})
              </div>

              <div style={imagesGrid}>
                {images.map((image) => (
                  <img
                    key={image.id}
                    src={image.url}
                    alt=""
                    style={thumb}
                  />
                ))}
              </div>
            </div>
          )}

          {videos.length > 0 && (
            <div style={imagesWrap}>
              <div style={panelTitle}>
                Video tạm ({videos.length})
              </div>

              <div style={videosGrid}>
                {videos.map((video) => (
                  <video
                    key={video.id}
                    src={video.url}
                    poster={video.thumb || undefined}
                    controls
                    preload="metadata"
                    style={videoPreview}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <footer
          className="zalo-import-modal-footer"
          style={detailModalFooter}
        >
          <div
            className="zalo-import-modal-actions"
          >
            <button
              style={deleteBtn}
              type="button"
              onClick={() =>
                void deleteImport()
              }
              disabled={busyAction !== null || reparsing}
            >
              {busyAction === "delete"
                ? "Đang xóa..."
                : "Xóa"}
            </button>

            <button
              style={dangerBtn}
              type="button"
              onClick={() =>
                void rejectImport()
              }
              disabled={actionDisabled || reparsing}
            >
              {busyAction === "reject"
                ? "Đang từ chối..."
                : "Từ chối"}
            </button>

            <button
              style={ghostBtn}
              type="button"
              onClick={() =>
                onEdit?.(currentRow)
              }
              disabled={actionDisabled || reparsing}
            >
              Chỉnh sửa
            </button>

            {isDuplicate ? (
              <>
                <button
                  style={primaryBtn}
                  type="button"
                  onClick={() =>
                    void approveImport(
                      "update_status"
                    )
                  }
                  disabled={actionDisabled || reparsing}
                >
                  {busyAction === "approve"
                    ? "Đang duyệt..."
                    : "Duyệt cập nhật"}
                </button>

                <button
                  style={ghostBtn}
                  type="button"
                  onClick={() =>
                    void approveImport(
                      "create_room"
                    )
                  }
                  disabled={actionDisabled || reparsing}
                >
                  Tạo phòng mới
                </button>
              </>
            ) : (
              <button
                style={primaryBtn}
                type="button"
                onClick={() =>
                  void approveImport(
                    "create_room"
                  )
                }
                disabled={actionDisabled || reparsing}
              >
                {busyAction === "approve"
                  ? "Đang duyệt..."
                  : "Duyệt đăng"}
              </button>
            )}
          </div>
        </footer>
      </section>

      {openNoticeModal && (
        <ImportNoticeModal
          row={currentRow}
          onClose={() =>
            setOpenNoticeModal(false)
          }
        />
      )}
    </div>
  );
}

function ImportNoticeModal({
  row,
  onClose,
}: {
  row: ImportRow;
  onClose: () => void;
}) {
  const quality =
    getImportQuality(row);

  const score =
    getQualityScore(row);

  const warnings =
    buildParserWarnings(row);

  const room =
    row.room_payload ?? {};

  const qualityMessages =
    new Set<string>();

  if (quality) {
    const groups = [
      Array.isArray(quality.blockers)
        ? quality.blockers
        : [],
      Array.isArray(quality.warnings)
        ? quality.warnings
        : [],
    ];

    for (const group of groups) {
      for (const item of group) {
        const message =
          getNoticeMessage(item);

        if (message) {
          qualityMessages.add(message);
        }
      }
    }
  }

  const extraWarnings =
    warnings.filter(
      (warning) =>
        !qualityMessages.has(warning)
    );

  useBodyScrollLock(true);

  useEffect(() => {
    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [onClose]);

  return createPortal(
    <div
      style={noticeModalOverlay}
      onMouseDown={(event) => {
        event.stopPropagation();

        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="zalo-import-notice-modal-shell"
        style={noticeModalShell}
        role="dialog"
        aria-modal="true"
        aria-label="Thông báo và điểm chất lượng"
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <header
          className="zalo-import-notice-modal-header"
          style={noticeModalHeader}
        >
          <div style={{ minWidth: 0 }}>
            <div style={noticeModalTitle}>
              Thông báo và điểm chất lượng
            </div>

            <div style={noticeModalSubtitle}>
              Phòng{" "}
              <b>
                {room.room_code || "-"}
              </b>

              {score != null && (
                <>
                  {" · "}
                  Điểm{" "}
                  <b>
                    {quality
                      ? `${score}/100`
                      : `${score}%`}
                  </b>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={noticeModalCloseButton}
            aria-label="Đóng"
          >
            ×
          </button>
        </header>

        <div
          className="zalo-import-notice-modal-body"
          style={noticeModalBody}
        >
          {quality ? (
            <QualitySummary
              row={row}
            />
          ) : warnings.length > 0 ? (
            <div style={noticeFallbackWarningBox}>
              <div style={noticeFallbackTitle}>
                Cảnh báo ({warnings.length})
              </div>

              <ul style={qualityList}>
                {warnings.map(
                  (
                    warning,
                    index
                  ) => (
                    <li
                      key={`${warning}-${index}`}
                    >
                      {warning}
                    </li>
                  )
                )}
              </ul>
            </div>
          ) : (
            <div style={noticeSuccessBox}>
              Không có cảnh báo.
            </div>
          )}

          {quality &&
            extraWarnings.length > 0 && (
              <div style={noticeFallbackWarningBox}>
                <div style={noticeFallbackTitle}>
                  Thông báo bổ sung
                </div>

                <ul style={qualityList}>
                  {extraWarnings.map(
                    (
                      warning,
                      index
                    ) => (
                      <li
                        key={`${warning}-${index}`}
                      >
                        {warning}
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}
        </div>
      </section>
    </div>,
    document.body
  );
}

function QualitySummary({
  row,
}: {
  row: ImportRow;
}) {
  const quality =
    getImportQuality(row);

  if (!quality) {
    return null;
  }

  const score =
    getQualityScore(row) ?? 0;

  const items =
    getQualityBreakdownItems(row);

  const blockers =
    Array.isArray(quality.blockers)
      ? quality.blockers
      : [];

  const warnings =
    Array.isArray(quality.warnings)
      ? quality.warnings
      : [];

  return (
    <section style={qualityPanel}>
      <div style={qualityHeader}>
        <div>
          <div style={qualityTitle}>
            Điểm chất lượng: {score}/100
          </div>
          <div style={qualitySubtitle}>
            Ngưỡng tự đăng: {quality.auto_import?.min_score ?? "-"}/100
          </div>
        </div>

        <span
          style={
            quality.eligible
              ? compactAutoEligibleBadge
              : compactAutoBlockedBadge
          }
        >
          {quality.auto_import?.published
            ? "Đã tự đăng"
            : quality.eligible
              ? "Đủ điều kiện tự đăng"
              : "Chưa đủ điều kiện tự đăng"}
        </span>
      </div>

      <div style={qualityGrid}>
        {items.map((item) => (
          <div
            key={item.key}
            style={qualityItem}
            title={item.reason}
          >
            <div style={qualityItemTop}>
              <span>{item.label}</span>
              <b>{item.score}/{item.max}</b>
            </div>

            <div style={qualityBarTrack}>
              <div
                style={{
                  ...qualityBarFill,
                  width: `${Math.max(
                    0,
                    Math.min(
                      100,
                      item.max > 0
                        ? (item.score / item.max) * 100
                        : 0
                    )
                  )}%`,
                }}
              />
            </div>

            <div style={qualityReason}>
              {item.reason || "-"}
            </div>
          </div>
        ))}
      </div>

      {blockers.length > 0 && (
        <div style={qualityBlockersBox}>
          <b>Lý do chặn tự đăng:</b>
          <ul style={qualityList}>
            {blockers.map((blocker: any, index: number) => (
              <li key={`${blocker?.code || "blocker"}-${index}`}>
                {typeof blocker === "string"
                  ? blocker
                  : blocker?.message || blocker?.code || "Lỗi không xác định"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div style={qualityWarningsBox}>
          <b>Cảnh báo:</b>
          <ul style={qualityList}>
            {warnings.map((warning: any, index: number) => (
              <li key={`warning-${index}`}>
                {typeof warning === "string"
                  ? warning
                  : warning?.message || warning?.code || "Cảnh báo không xác định"}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={qualityConfigLine}>
        Auto import: <b>{quality.auto_import?.enabled ? "Bật" : "Tắt"}</b>
        {" · "}
        Dry-run: <b>{quality.auto_import?.dry_run ? "Có" : "Không"}</b>
        {" · "}
        Nhóm được phép: <b>{quality.auto_import?.allowed_group ? "Có" : "Không"}</b>
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

const statusLine: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
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

const meta: CSSProperties = {
  color: "#374151",
  fontSize: 14,
  marginTop: 2,
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

const panel: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 12,
  minWidth: 0,
  maxHeight: 560,
  overflowY: "auto",
  overscrollBehaviorY: "auto",
  WebkitOverflowScrolling: "touch",
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
  maxHeight: "none",
  overflowY: "visible",
};


const reparsePanelHeader: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
};

const reparseHelpText: CSSProperties = {
  marginTop: -4,
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.45,
};

const manualReparseBadge: CSSProperties = {
  flex: "0 0 auto",
  display: "inline-flex",
  alignItems: "center",
  minHeight: 25,
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid #a7f3d0",
  background: "#ecfdf5",
  color: "#047857",
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const reparseTextarea: CSSProperties = {
  width: "100%",
  minHeight: 390,
  resize: "vertical",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: 11,
  background: "#fff",
  color: "#0f172a",
  fontFamily: "inherit",
  fontSize: 14,
  lineHeight: 1.5,
  outline: "none",
  boxSizing: "border-box",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

const reparseActions: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 10,
};

const reparseRestoreBtn: CSSProperties = {
  minHeight: 38,
  padding: "8px 11px",
  borderRadius: 9,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#334155",
  fontWeight: 700,
  cursor: "pointer",
};

const reparsePrimaryBtn: CSSProperties = {
  minHeight: 38,
  padding: "8px 12px",
  borderRadius: 9,
  border: "1px solid #0284c7",
  background: "#0ea5e9",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const reparseErrorBox: CSSProperties = {
  marginTop: 10,
  padding: 10,
  borderRadius: 9,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c",
  fontSize: 12,
  lineHeight: 1.5,
  overflowWrap: "anywhere",
};

const reparseSuccessBox: CSSProperties = {
  marginTop: 10,
  padding: 10,
  borderRadius: 9,
  border: "1px solid #a7f3d0",
  background: "#ecfdf5",
  color: "#047857",
  fontSize: 12,
  lineHeight: 1.5,
};

const reparseFootnote: CSSProperties = {
  marginTop: 9,
  color: "#64748b",
  fontSize: 11,
  lineHeight: 1.45,
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

const compactCard: CSSProperties = {
  padding: 14,
  overflow: "hidden",
  background:
    "linear-gradient(145deg, rgba(255,255,255,0.90) 0%, rgba(241,245,249,0.78) 100%)",
  border: "1px solid rgba(148,163,184,0.28)",
  boxShadow:
    "0 14px 34px rgba(15, 23, 42, 0.10)",
  color: "#0f172a",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
};

const compactMediaColumn: CSSProperties = {
  minWidth: 0,
};

const compactImageFrame: CSSProperties = {
  position: "relative",
  minHeight: 270,
  aspectRatio: "16 / 10",
  overflow: "hidden",
  borderRadius: 14,
  background: "#0f172a",
  border: "1px solid rgba(255,255,255,0.16)",
};

const compactMainImage: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const compactImageEmpty: CSSProperties = {
  width: "100%",
  height: "100%",
  minHeight: 270,
  display: "grid",
  placeItems: "center",
  color: "#94a3b8",
  fontWeight: 700,
  background:
    "radial-gradient(circle at center, #263746 0%, #111827 72%)",
};

const compactImageGroupBadge: CSSProperties = {
  position: "absolute",
  top: 10,
  left: 10,
  maxWidth: "calc(100% - 20px)",
  borderRadius: 8,
  padding: "5px 8px",
  background: "rgba(15,23,42,0.82)",
  color: "#e2e8f0",
  fontSize: 12,
  fontWeight: 700,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  backdropFilter: "blur(8px)",
};

const compactImageArrow: CSSProperties = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  width: 38,
  height: 38,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.24)",
  background: "rgba(15,23,42,0.62)",
  color: "#fff",
  fontSize: 28,
  lineHeight: 1,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  backdropFilter: "blur(8px)",
};

const compactImageCaption: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  padding: "28px 12px 10px",
  color: "#fff",
  fontSize: 12,
  lineHeight: 1.4,
  background:
    "linear-gradient(transparent, rgba(2,6,23,0.9))",
};

const compactThumbnailStrip: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 10,
  overflowX: "auto",
  paddingBottom: 5,
};

const compactThumbnailButton: CSSProperties = {
  flex: "0 0 58px",
  width: 58,
  height: 48,
  padding: 0,
  overflow: "hidden",
  borderRadius: 9,
  border: "2px solid",
  background: "#0f172a",
  cursor: "pointer",
};

const compactThumbnailImage: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const compactSummaryColumn: CSSProperties = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const compactSummaryTopLine: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
};

const compactStatusBadge: CSSProperties = {
  background: "rgba(219,234,254,0.72)",
  color: "#1d4ed8",
  border: "1px solid rgba(96,165,250,0.42)",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 800,
};

const compactViewRoomBtn: CSSProperties = {
  color: "#0369a1",
  textDecoration: "none",
  border: "1px solid rgba(14,165,233,0.32)",
  background: "rgba(224,242,254,0.58)",
  padding: "6px 9px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 700,
};

const compactInfoBlock: CSSProperties = {
  minWidth: 0,
};

const compactInfoLabel: CSSProperties = {
  marginBottom: 4,
  color: "#475569",
  fontSize: 13,
  fontWeight: 800,
};

const compactLocationValue: CSSProperties = {
  color: "#0f172a",
  fontSize: 16,
  lineHeight: 1.45,
  fontWeight: 700,
  overflowWrap: "anywhere",
};

const compactInfoValue: CSSProperties = {
  color: "#1e293b",
  fontSize: 15,
  fontWeight: 700,
  overflowWrap: "anywhere",
};

const compactAccentValue: CSSProperties = {
  color: "#075985",
  fontSize: 15,
  fontWeight: 800,
  padding: "6px 9px",
  borderRadius: 8,
  border: "1px solid rgba(14,165,233,0.48)",
  background: "rgba(224,242,254,0.72)",
  boxShadow: "0 0 0 2px rgba(14,165,233,0.06)",
};

const compactMetaLine: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px 16px",
  marginTop: "auto",
  color: "#64748b",
  fontSize: 12,
};

const compactDuplicateBox: CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid rgba(251,146,60,0.34)",
  background: "rgba(255,237,213,0.72)",
  color: "#9a3412",
  fontSize: 12,
  lineHeight: 1.5,
};

const compactActionsBar: CSSProperties = {
  marginTop: 14,
  paddingTop: 12,
  borderTop: "1px solid rgba(148,163,184,0.22)",
};

const compactButtonBase: CSSProperties = {
  minHeight: 42,
  borderRadius: 9,
  padding: "9px 13px",
  fontWeight: 800,
  cursor: "pointer",
};

const compactDeleteBtn: CSSProperties = {
  ...compactButtonBase,
  marginRight: "auto",
  border: "1px solid rgba(248,113,113,0.34)",
  background: "rgba(254,226,226,0.68)",
  color: "#b91c1c",
};

const compactDetailBtn: CSSProperties = {
  ...compactButtonBase,
  border: "1px solid rgba(14,165,233,0.34)",
  background: "rgba(224,242,254,0.72)",
  color: "#0369a1",
};

const compactRejectBtn: CSSProperties = {
  ...compactButtonBase,
  border: "1px solid rgba(248,113,113,0.34)",
  background: "rgba(254,242,242,0.58)",
  color: "#b91c1c",
};

const compactEditBtn: CSSProperties = {
  ...compactButtonBase,
  border: "1px solid rgba(148,163,184,0.30)",
  background: "rgba(255,255,255,0.64)",
  color: "#334155",
};

const compactPrimaryBtn: CSSProperties = {
  ...compactButtonBase,
  border: "1px solid #38bdf8",
  background: "#0ea5e9",
  color: "#fff",
  boxShadow: "0 8px 18px rgba(14,165,233,0.20)",
};

const compactCreateBtn: CSSProperties = {
  ...compactButtonBase,
  border: "1px solid rgba(129,140,248,0.34)",
  background: "rgba(238,242,255,0.72)",
  color: "#4338ca",
};

const compactAutoEligibleBadge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 26,
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid rgba(52,211,153,0.34)",
  background: "rgba(209,250,229,0.72)",
  color: "#047857",
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const compactAutoBlockedBadge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 26,
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid rgba(248,113,113,0.34)",
  background: "rgba(254,226,226,0.72)",
  color: "#b91c1c",
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const compactNoticeBadgeButton: CSSProperties = {
  appearance: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 26,
  maxWidth: "100%",
  padding: "3px 9px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  lineHeight: 1.25,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  cursor: "pointer",
};

const compactNoticeBadgeWarning: CSSProperties = {
  border: "1px solid rgba(248,113,113,0.42)",
  background: "rgba(254,226,226,0.78)",
  color: "#b91c1c",
};

const compactNoticeBadgeSuccess: CSSProperties = {
  border: "1px solid rgba(52,211,153,0.34)",
  background: "rgba(209,250,229,0.72)",
  color: "#047857",
};

const noticeModalOverlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10020,
  display: "grid",
  placeItems: "center",
  padding: 12,
  background: "rgba(15,23,42,0.68)",
  backdropFilter: "blur(7px)",
};

const noticeModalShell: CSSProperties = {
  width: "min(860px, calc(100vw - 24px))",
  maxHeight: "calc(100dvh - 24px)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  borderRadius: 18,
  border: "1px solid #dbe3ee",
  background: "#fff",
  boxShadow: "0 28px 90px rgba(15,23,42,0.38)",
};

const noticeModalHeader: CSSProperties = {
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "16px 18px",
  borderBottom: "1px solid #e5e7eb",
  background: "rgba(255,255,255,0.98)",
};

const noticeModalTitle: CSSProperties = {
  color: "#0f172a",
  fontSize: 18,
  fontWeight: 900,
};

const noticeModalSubtitle: CSSProperties = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 13,
  overflowWrap: "anywhere",
};

const noticeModalCloseButton: CSSProperties = {
  flex: "0 0 auto",
  width: 38,
  height: 38,
  display: "grid",
  placeItems: "center",
  borderRadius: 999,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontSize: 24,
  lineHeight: 1,
  cursor: "pointer",
};

const noticeModalBody: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  padding: 14,
  WebkitOverflowScrolling: "touch",
};

const noticeFallbackWarningBox: CSSProperties = {
  marginTop: 10,
  padding: 12,
  borderRadius: 12,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
};

const noticeFallbackTitle: CSSProperties = {
  fontWeight: 900,
};

const noticeSuccessBox: CSSProperties = {
  padding: 14,
  borderRadius: 12,
  border: "1px solid #a7f3d0",
  background: "#ecfdf5",
  color: "#047857",
  fontWeight: 800,
};

const qualityPanel: CSSProperties = {
  marginBottom: 14,
  padding: 14,
  borderRadius: 14,
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
};

const qualityHeader: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 12,
  marginBottom: 12,
};

const qualityTitle: CSSProperties = {
  color: "#0f172a",
  fontSize: 17,
  fontWeight: 800,
};

const qualitySubtitle: CSSProperties = {
  marginTop: 3,
  color: "#64748b",
  fontSize: 12,
};

const qualityGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 10,
};

const qualityItem: CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  background: "#fff",
};

const qualityItemTop: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  color: "#334155",
  fontSize: 13,
};

const qualityBarTrack: CSSProperties = {
  height: 7,
  marginTop: 7,
  overflow: "hidden",
  borderRadius: 999,
  background: "#e2e8f0",
};

const qualityBarFill: CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "#0ea5e9",
};

const qualityReason: CSSProperties = {
  marginTop: 6,
  color: "#64748b",
  fontSize: 11,
  lineHeight: 1.4,
};

const qualityBlockersBox: CSSProperties = {
  marginTop: 12,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  fontSize: 13,
};

const qualityWarningsBox: CSSProperties = {
  marginTop: 10,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #fde68a",
  background: "#fffbeb",
  color: "#92400e",
  fontSize: 13,
};

const qualityList: CSSProperties = {
  margin: "6px 0 0",
  paddingLeft: 20,
  lineHeight: 1.55,
};

const qualityConfigLine: CSSProperties = {
  marginTop: 10,
  color: "#475569",
  fontSize: 12,
};

const videosGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 10,
};

const videoPreview: CSSProperties = {
  width: "100%",
  maxHeight: 320,
  borderRadius: 10,
  background: "#0f172a",
};

const detailModalOverlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9998,
  display: "grid",
  placeItems: "center",
  padding: 18,
  background: "rgba(15,23,42,0.62)",
  backdropFilter: "blur(7px)",
};

const detailModalShell: CSSProperties = {
  width: "min(1460px, calc(100vw - 36px))",
  maxHeight: "calc(100dvh - 36px)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  borderRadius: 20,
  border: "1px solid #dbe3ee",
  background: "#fff",
  boxShadow: "0 28px 90px rgba(15,23,42,0.34)",
  transition: "opacity 160ms ease",
};

const detailModalHeader: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  padding: "18px 20px",
  borderBottom: "1px solid #e5e7eb",
  background: "rgba(255,255,255,0.97)",
  backdropFilter: "blur(12px)",
};

const detailModalCloseBtn: CSSProperties = {
  flex: "0 0 auto",
  width: 40,
  height: 40,
  borderRadius: 999,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontSize: 25,
  lineHeight: 1,
  cursor: "pointer",
};

const detailModalBody: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  padding: 16,
  overscrollBehaviorY: "auto",
  WebkitOverflowScrolling: "touch",
};

const detailModalFooter: CSSProperties = {
  position: "sticky",
  bottom: 0,
  zIndex: 2,
  padding: "14px 18px",
  borderTop: "1px solid #e5e7eb",
  background: "rgba(255,255,255,0.98)",
  backdropFilter: "blur(12px)",
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

const toastBox: CSSProperties = {
  position: "fixed",
  right: 20,
  bottom: 20,
  zIndex: 10000,
  maxWidth: 420,
  border: "1px solid",
  borderRadius: 12,
  padding: "12px 16px",
  boxShadow: "0 14px 40px rgba(15, 23, 42, 0.18)",
  fontWeight: 600,
};
