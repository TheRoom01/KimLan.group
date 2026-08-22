"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";

type VipLinkRow = {
  id: string;
  note?: string | null;
  expires_at?: string | null;
  revoked_at?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  creator_admin_name?: string | null;
  link?: string | null;
};

type CopyState =
  | "idle"
  | "copied"
  | "error";

const DAY_OPTIONS = [
  1,
  3,
  7,
  10,
  20,
  30,
  60,
  90,
];

function formatDateTime(
  value?: string | null
) {
  if (!value) return "-";

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "-";
  }

  return new Intl.DateTimeFormat(
    "vi-VN",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone:
        "Asia/Ho_Chi_Minh",
    }
  ).format(date);
}

function getStatus(
  row: VipLinkRow
) {
  if (row.revoked_at) {
    return {
      text: "Đã thu hồi",
      style:
        revokedBadge,
    };
  }

  const expiresAt =
    row.expires_at
      ? new Date(
          row.expires_at
        ).getTime()
      : 0;

  if (
    !expiresAt ||
    expiresAt <=
      Date.now()
  ) {
    return {
      text: "Đã hết hạn",
      style:
        expiredBadge,
    };
  }

  return {
    text: "Đang hoạt động",
    style:
      activeBadge,
  };
}

async function copyText(
  value: string
) {
  if (
    navigator.clipboard &&
    window.isSecureContext
  ) {
    await navigator.clipboard.writeText(
      value
    );
    return;
  }

  const textarea =
    document.createElement(
      "textarea"
    );

  textarea.value =
    value;

  textarea.style.position =
    "fixed";

  textarea.style.opacity =
    "0";

  document.body.appendChild(
    textarea
  );

  textarea.focus();
  textarea.select();

  const copied =
    document.execCommand(
      "copy"
    );

  textarea.remove();

  if (!copied) {
    throw new Error(
      "Không thể sao chép."
    );
  }
}

export default function VipLinkManager({ buttonStyle }: { buttonStyle?: CSSProperties }) {
  const [
    open,
    setOpen,
  ] = useState(false);

  const [
    links,
    setLinks,
  ] = useState<
    VipLinkRow[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    creating,
    setCreating,
  ] = useState(false);

  const [
    deletingId,
    setDeletingId,
  ] = useState<string | null>(
    null
  );

  const [
    copiedRowId,
    setCopiedRowId,
  ] = useState<string | null>(
    null
  );

  const [
    error,
    setError,
  ] = useState("");

  const [
    days,
    setDays,
  ] = useState(20);

  const [
    note,
    setNote,
  ] = useState(
    "VIP 20 ngày"
  );

  const [
    createdLink,
    setCreatedLink,
  ] = useState("");

  const [
    createdLinkId,
    setCreatedLinkId,
  ] = useState("");

  const [
    copyState,
    setCopyState,
  ] =
    useState<CopyState>(
      "idle"
    );

  const activeCount =
    useMemo(
      () =>
        links.filter(
          (row) =>
            getStatus(row)
              .text ===
            "Đang hoạt động"
        ).length,
      [links]
    );

  const loadLinks =
    useCallback(
      async () => {
        setLoading(true);
        setError("");

        try {
          const response =
            await fetch(
              "/api/admin/vip-links",
              {
                cache:
                  "no-store",
              }
            );

          const json =
            await response
              .json()
              .catch(
                () => ({})
              );

          if (
            !response.ok ||
            !json?.ok
          ) {
            throw new Error(
              json?.error ||
                "Không tải được danh sách Link Giỏ hàng."
            );
          }

          setLinks(
            Array.isArray(
              json.data
            )
              ? json.data
              : []
          );
        } catch (
          loadError: any
        ) {
          setError(
            loadError?.message ||
              "Không tải được danh sách Link Giỏ hàng."
          );
        } finally {
          setLoading(false);
        }
      },
      []
    );

  const openManager =
    useCallback(() => {
      setOpen(true);
      setCreatedLink("");
      setCreatedLinkId("");
      setCopyState(
        "idle"
      );
      void loadLinks();
    }, [loadLinks]);

  const closeManager =
    useCallback(() => {
      if (creating) {
        return;
      }

      setOpen(false);
      setError("");
      setCopyState(
        "idle"
      );
    }, [creating]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow =
      document.body.style
        .overflow;

    document.body.style.overflow =
      "hidden";

    const onKeyDown = (
      event: KeyboardEvent
    ) => {
      if (
        event.key ===
        "Escape"
      ) {
        closeManager();
      }
    };

    window.addEventListener(
      "keydown",
      onKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        onKeyDown
      );
    };
  }, [
    open,
    closeManager,
  ]);

  async function createLink() {
    if (creating) return;

    setCreating(true);
    setError("");
    setCreatedLink("");
    setCopyState(
      "idle"
    );

    try {
      const response =
        await fetch(
          "/api/admin/vip-links",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify(
              {
                days,
                note:
                  note.trim() ||
                  `VIP ${days} ngày`,
              }
            ),
          }
        );

      const json =
        await response
          .json()
          .catch(
            () => ({})
          );

      if (
        !response.ok ||
        !json?.ok ||
        !json?.link
      ) {
        throw new Error(
          json?.error ||
            "Không tạo được Link Giỏ hàng."
        );
      }

      setCreatedLink(
        String(
          json.link
        )
      );

      setCreatedLinkId(
        String(
          json?.data?.id ?? ""
        )
      );

      if (json.data) {
        setLinks(
          (
            current
          ) => [
            json.data,
            ...current.filter(
              (
                item
              ) =>
                item.id !==
                json.data.id
            ),
          ]
        );
      } else {
        await loadLinks();
      }
    } catch (
      createError: any
    ) {
      setError(
        createError?.message ||
          "Không tạo được Link Giỏ hàng."
      );
    } finally {
      setCreating(false);
    }
  }

  async function copySavedLink(
    row: VipLinkRow
  ) {
    if (!row.link) {
      setError(
        "Link cũ không lưu token gốc. Hãy xóa và tạo lại link mới."
      );
      return;
    }

    setError("");

    try {
      await copyText(
        row.link
      );

      setCopiedRowId(
        row.id
      );

      window.setTimeout(
        () => {
          setCopiedRowId(
            (
              current
            ) =>
              current ===
              row.id
                ? null
                : current
          );
        },
        2200
      );
    } catch {
      setError(
        "Không thể sao chép Link Giỏ hàng."
      );
    }
  }

  async function deleteLink(
    row: VipLinkRow
  ) {
    if (
      deletingId ||
      creating
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        [
          "Bạn có chắc muốn xóa link Giỏ hàng này?",
          "",
          `Ghi chú: ${row.note || "Link Giỏ hàng"}`,
          `Ngày hết hạn: ${formatDateTime(row.expires_at)}`,
          "",
          "Sau khi xóa, link sẽ mất hiệu lực ngay và không thể khôi phục.",
        ].join("\n")
      );

    if (!confirmed) {
      return;
    }

    setDeletingId(
      row.id
    );
    setError("");

    try {
      const response =
        await fetch(
          "/api/admin/vip-links",
          {
            method: "DELETE",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              id: row.id,
            }),
          }
        );

      const json =
        await response
          .json()
          .catch(
            () => ({})
          );

      if (
        !response.ok ||
        !json?.ok
      ) {
        throw new Error(
          json?.error ||
            "Không xóa được Link Giỏ hàng."
        );
      }

      setLinks(
        (
          current
        ) =>
          current.filter(
            (
              item
            ) =>
              item.id !==
              row.id
          )
      );

      if (
        createdLinkId ===
        row.id
      ) {
        setCreatedLink("");
        setCreatedLinkId("");
        setCopyState(
          "idle"
        );
      }
    } catch (
      deleteError: any
    ) {
      setError(
        deleteError?.message ||
          "Không xóa được Link Giỏ hàng."
      );
    } finally {
      setDeletingId(
        null
      );
    }
  }

  async function copyCreatedLink() {
    if (!createdLink) {
      return;
    }

    try {
      await copyText(
        createdLink
      );

      setCopyState(
        "copied"
      );

      window.setTimeout(
        () =>
          setCopyState(
            "idle"
          ),
        2200
      );
    } catch {
      setCopyState(
        "error"
      );
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={
          openManager
        }
        style={{ ...openButton, ...buttonStyle }}
      >
        🔗Link Giỏ hàng
      </button>

      {open && (
        <div
          style={
            overlay
          }
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeManager();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Quản lý Link Giỏ hàng"
            style={
              modal
            }
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            <header
              style={
                modalHeader
              }
            >
              <div>
                <h2
                  style={
                    modalTitle
                  }
                >
                  Quản lý Link Giỏ hàng
                </h2>

                <div
                  style={
                    modalSubtitle
                  }
                >
                  {activeCount} link đang hoạt động
                </div>
              </div>

              <button
                type="button"
                onClick={
                  closeManager
                }
                disabled={
                  creating ||
                  Boolean(
                    deletingId
                  )
                }
                style={
                  closeButton
                }
                aria-label="Đóng"
              >
                ×
              </button>
            </header>

            <div
              style={
                modalBody
              }
            >
              <div
                style={
                  createPanel
                }
              >
                <div
                  style={
                    sectionTitle
                  }
                >
                  Tạo link mới
                </div>

                <div
                  style={
                    formGrid
                  }
                >
                  <label
                    style={
                      label
                    }
                  >
                    Thời hạn

                    <select
                      value={
                        days
                      }
                      onChange={(
                        event
                      ) => {
                        const nextDays =
                          Number(
                            event.target
                              .value
                          );

                        setDays(
                          nextDays
                        );

                        setNote(
                          `VIP ${nextDays} ngày`
                        );
                      }}
                      style={
                        input
                      }
                    >
                      {DAY_OPTIONS.map(
                        (
                          option
                        ) => (
                          <option
                            key={
                              option
                            }
                            value={
                              option
                            }
                          >
                            {option} ngày
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label
                    style={
                      label
                    }
                  >
                    Ghi chú

                    <input
                      value={
                        note
                      }
                      onChange={(
                        event
                      ) =>
                        setNote(
                          event
                            .target
                            .value
                        )
                      }
                      maxLength={
                        200
                      }
                      style={
                        input
                      }
                      placeholder="Ví dụ: Khách A - VIP 20 ngày"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    void createLink()
                  }
                  disabled={
                    creating
                  }
                  style={{
                    ...createButton,
                    opacity:
                      creating
                        ? 0.65
                        : 1,
                  }}
                >
                  {creating
                    ? "Đang tạo..."
                    : "Tạo link Giỏ hàng mới"}
                </button>
              </div>

              {createdLink && (
                <div
                  style={
                    resultPanel
                  }
                >
                  <div
                    style={
                      resultTitle
                    }
                  >
                    Link mới đã được tạo
                  </div>

                  <div
                    style={
                      resultHint
                    }
                  >
                    Hãy sao chép ngay. Token gốc không được lưu trong database và sẽ không thể xem lại sau khi đóng modal.
                  </div>

                  <div
                    style={
                      resultRow
                    }
                  >
                    <input
                      readOnly
                      value={
                        createdLink
                      }
                      onFocus={(
                        event
                      ) =>
                        event.currentTarget.select()
                      }
                      style={
                        resultInput
                      }
                    />

                    <button
                      type="button"
                      onClick={() =>
                        void copyCreatedLink()
                      }
                      style={
                        copyButton
                      }
                    >
                      {copyState ===
                      "copied"
                        ? "✓ Đã copy"
                        : copyState ===
                            "error"
                          ? "Copy lỗi"
                          : "Sao chép"}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div
                  style={
                    errorBox
                  }
                >
                  {error}
                </div>
              )}

              <div
                style={
                  listHeader
                }
              >
                <div
                  style={
                    sectionTitle
                  }
                >
                  Các link đã tạo
                </div>

                <button
                  type="button"
                  onClick={() =>
                    void loadLinks()
                  }
                  disabled={
                    loading
                  }
                  style={
                    refreshButton
                  }
                >
                  {loading
                    ? "Đang tải..."
                    : "Tải lại"}
                </button>
              </div>

              <div
                style={
                  listWrap
                }
              >
                {loading &&
                links.length ===
                  0 ? (
                  <div
                    style={
                      emptyState
                    }
                  >
                    Đang tải...
                  </div>
                ) : links.length ===
                  0 ? (
                  <div
                    style={
                      emptyState
                    }
                  >
                    Chưa có Link Giỏ hàng.
                  </div>
                ) : (
                  links.map(
                    (
                      row
                    ) => {
                      const status =
                        getStatus(
                          row
                        );

                      return (
                        <article
                          key={
                            row.id
                          }
                          style={
                            linkCard
                          }
                        >
                          <div
                            style={
                              linkCardTop
                            }
                          >
                            <div
                              style={
                                linkNote
                              }
                            >
                              {row.note ||
                                "Link Giỏ hàng"}
                            </div>

                            <div
                              style={
                                linkActions
                              }
                            >
                              <span
                                style={
                                  status.style
                                }
                              >
                                {status.text}
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  void copySavedLink(
                                    row
                                  )
                                }
                                disabled={
                                  !row.link ||
                                  Boolean(
                                    deletingId
                                  ) ||
                                  creating
                                }
                                style={{
                                  ...copySavedButton,
                                  opacity:
                                    !row.link
                                      ? 0.45
                                      : 1,
                                  cursor:
                                    !row.link
                                      ? "not-allowed"
                                      : "pointer",
                                }}
                                title={
                                  row.link
                                    ? "Sao chép Link Giỏ hàng"
                                    : "Link cũ không lưu token gốc"
                                }
                              >
                                {copiedRowId ===
                                row.id
                                  ? "✓ Đã copy"
                                  : "Copy"}
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  void deleteLink(
                                    row
                                  )
                                }
                                disabled={
                                  Boolean(
                                    deletingId
                                  ) ||
                                  creating
                                }
                                style={{
                                  ...deleteButton,
                                  opacity:
                                    deletingId ===
                                    row.id
                                      ? 0.65
                                      : 1,
                                }}
                              >
                                {deletingId ===
                                row.id
                                  ? "Đang xóa..."
                                  : "Xóa"}
                              </button>
                            </div>
                          </div>

                          <div
                            style={
                              dateGrid
                            }
                          >
                            <div style={{ gridColumn: "1 / -1" }}>
                              <div
                                style={
                                  dateLabel
                                }
                              >
                                Admin tạo link
                              </div>

                              <div
                                style={
                                  dateValue
                                }
                              >
                                {row.creator_admin_name || "Chưa cập nhật tên"}
                              </div>
                            </div>

                            <div>
                              <div
                                style={
                                  dateLabel
                                }
                              >
                                Ngày tạo
                              </div>

                              <div
                                style={
                                  dateValue
                                }
                              >
                                {formatDateTime(
                                  row.created_at
                                )}
                              </div>
                            </div>

                            <div>
                              <div
                                style={
                                  dateLabel
                                }
                              >
                                Ngày hết hạn
                              </div>

                              <div
                                style={
                                  dateValue
                                }
                              >
                                {formatDateTime(
                                  row.expires_at
                                )}
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    }
                  )
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

const openButton: CSSProperties = {
  border: "1px solid #c4b5fd",
  background:
    "linear-gradient(135deg, #7c3aed, #6d28d9)",
  color: "#fff",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10050,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  background:
    "rgba(15, 23, 42, 0.52)",
  backdropFilter:
    "blur(8px)",
  WebkitBackdropFilter:
    "blur(8px)",
};

const modal: CSSProperties = {
  width:
    "min(760px, 100%)",
  maxHeight:
    "min(820px, calc(100vh - 32px))",
  display: "flex",
  flexDirection:
    "column",
  overflow: "hidden",
  borderRadius: 18,
  border:
    "1px solid rgba(148, 163, 184, 0.34)",
  background:
    "rgba(255,255,255,0.97)",
  boxShadow:
    "0 28px 80px rgba(15,23,42,0.30)",
};

const modalHeader: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent:
    "space-between",
  gap: 16,
  padding: "16px 18px",
  borderBottom:
    "1px solid #e5e7eb",
};

const modalTitle: CSSProperties = {
  margin: 0,
  fontSize: 20,
  color: "#111827",
};

const modalSubtitle: CSSProperties = {
  marginTop: 3,
  fontSize: 13,
  color: "#6b7280",
};

const closeButton: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 10,
  border:
    "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontSize: 25,
  lineHeight: 1,
  cursor: "pointer",
};

const modalBody: CSSProperties = {
  overflowY: "auto",
  padding: 18,
};

const createPanel: CSSProperties = {
  padding: 14,
  borderRadius: 14,
  border:
    "1px solid #ddd6fe",
  background: "#f5f3ff",
};

const sectionTitle: CSSProperties = {
  fontWeight: 800,
  color: "#111827",
};

const formGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "minmax(130px, 0.45fr) minmax(220px, 1fr)",
  gap: 12,
  marginTop: 12,
  marginBottom: 12,
};

const label: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
  color: "#374151",
};

const input: CSSProperties = {
  width: "100%",
  minHeight: 42,
  boxSizing:
    "border-box",
  borderRadius: 10,
  border:
    "1px solid #cbd5e1",
  padding: "9px 11px",
  background: "#fff",
  color: "#111827",
  outline: "none",
};

const createButton: CSSProperties = {
  width: "100%",
  border: "none",
  borderRadius: 10,
  padding: "11px 14px",
  background: "#7c3aed",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const resultPanel: CSSProperties = {
  marginTop: 14,
  padding: 14,
  borderRadius: 14,
  border:
    "1px solid #86efac",
  background: "#f0fdf4",
};

const resultTitle: CSSProperties = {
  fontWeight: 800,
  color: "#166534",
};

const resultHint: CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  lineHeight: 1.45,
  color: "#15803d",
};

const resultRow: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 10,
};

const resultInput: CSSProperties = {
  flex: 1,
  minWidth: 0,
  borderRadius: 10,
  border:
    "1px solid #86efac",
  padding: "10px 11px",
  background: "#fff",
  color: "#111827",
};

const copyButton: CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#16a34a",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const errorBox: CSSProperties = {
  marginTop: 14,
  padding: 12,
  borderRadius: 12,
  border:
    "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
};

const listHeader: CSSProperties = {
  display: "flex",
  justifyContent:
    "space-between",
  alignItems: "center",
  gap: 12,
  marginTop: 18,
  marginBottom: 10,
};

const refreshButton: CSSProperties = {
  border:
    "1px solid #d1d5db",
  borderRadius: 9,
  padding: "7px 10px",
  background: "#fff",
  color: "#374151",
  fontWeight: 700,
  cursor: "pointer",
};

const listWrap: CSSProperties = {
  display: "grid",
  gap: 10,
};

const emptyState: CSSProperties = {
  padding: 22,
  textAlign: "center",
  borderRadius: 12,
  border:
    "1px dashed #d1d5db",
  color: "#6b7280",
};

const linkCard: CSSProperties = {
  padding: 13,
  borderRadius: 13,
  border:
    "1px solid #e5e7eb",
  background: "#fff",
};

const linkCardTop: CSSProperties = {
  display: "flex",
  justifyContent:
    "space-between",
  alignItems:
    "flex-start",
  gap: 12,
};

const linkActions: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
};

const copySavedButton: CSSProperties = {
  border:
    "1px solid #bfdbfe",
  borderRadius: 8,
  padding: "5px 9px",
  background: "#eff6ff",
  color: "#1d4ed8",
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const deleteButton: CSSProperties = {
  border:
    "1px solid #fecaca",
  borderRadius: 8,
  padding: "5px 9px",
  background: "#fff",
  color: "#b91c1c",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const linkNote: CSSProperties = {
  minWidth: 0,
  fontWeight: 800,
  color: "#111827",
  overflowWrap:
    "anywhere",
};

const dateGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "repeat(2, minmax(0, 1fr))",
  gap: 12,
  marginTop: 10,
};

const dateLabel: CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
};

const dateValue: CSSProperties = {
  marginTop: 2,
  fontSize: 14,
  fontWeight: 700,
  color: "#1f2937",
};

const badgeBase: CSSProperties = {
  borderRadius: 999,
  padding: "3px 8px",
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const activeBadge: CSSProperties = {
  ...badgeBase,
  border:
    "1px solid #86efac",
  background: "#f0fdf4",
  color: "#15803d",
};

const expiredBadge: CSSProperties = {
  ...badgeBase,
  border:
    "1px solid #fed7aa",
  background: "#fff7ed",
  color: "#c2410c",
};

const revokedBadge: CSSProperties = {
  ...badgeBase,
  border:
    "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c",
};
