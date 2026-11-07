"use client";
import { useEffect, useState } from "react";
import ZaloReaderControls from "./ZaloReaderControls";
import { type ReaderImportIssue, type ReaderIssueSource } from "@/lib/zalo-reader/import-issues";

const reportCounters = [
  ["new_messages", "Tin mới"],
  ["rooms_read", "Phòng đọc được"],
  ["pending_created", "Gửi lên chờ duyệt"],
  ["new_rooms", "Phòng mới"],
  ["updated_rooms", "Cập nhật"],
  ["needs_review", "Cần xác minh"],
  ["existing_sources", "Đã xử lý trước đó"],
  ["unchanged", "Không đổi"],
  ["failed", "Import lỗi"],
  ["pending_with_issues", "Chờ duyệt có cảnh báo"],
] as const;

const issueDescriptions: Record<string, string> = {
  API_UNAVAILABLE: "Không kết nối được API nhập phòng",
  IMPORT_FAILED: "Không lưu được bản nhập",
  GROUP_SCAN_FAILED: "Không đọc được nhóm Zalo",
  GROUP_NAME_AMBIGUOUS: "Tìm thấy nhiều nhóm trùng tên",
  LOGIN_REQUIRED: "Reader cần đăng nhập lại Zalo",
  PARSER_FAILED: "Không phân tích được tin Zalo",
  ROOM_PENDING_EXISTS: "Phòng đã có bản chờ duyệt",
  NO_USABLE_MEDIA: "Không lưu được ảnh hoặc video hợp lệ",
  TEST_NO_VALID_MEDIA: "Bản thử không có ảnh hoặc video hợp lệ",
  MEDIA_INCOMPLETE: "Thiếu ảnh hoặc video so với tin nguồn",
  MEDIA_UNVERIFIED: "Chưa xác minh đủ ảnh hoặc video",
  MEDIA_LOADING_TIMEOUT: "Quá thời gian chờ tải media",
  MEDIA_COUNT_MISMATCH: "Số lượng media không khớp với tin nguồn",
  VIDEO_MANUAL_UPLOAD_REQUIRED: "Cần bổ sung video thủ công",
  VIDEO_SOURCE_MISSING: "Không tìm thấy nguồn video",
  VIDEO_DOWNLOAD_FAILED: "Không tải được video",
  IMAGE_DOWNLOAD_OR_PROCESS_FAILED: "Không tải hoặc xử lý được ảnh",
  IMAGE_STORAGE_UPLOAD_FAILED: "Không lưu được ảnh tạm",
  MEDIA_SOURCE_MISSING: "Không tìm thấy ảnh hoặc video trong tin nguồn",
  MEDIA_DATABASE_FAILED: "Không ghi được thông tin media",
  PENDING_INCOMPLETE: "Đã tạo bản chờ duyệt, cần kiểm tra dữ liệu",
};

function describeIssue(code: string) {
  return issueDescriptions[code] ?? (code.startsWith("HTTP_") ? `API trả mã ${code.slice(5)}` : `Mã lỗi ${code}`);
}

function ImportIssueCount({ count, issues, sources, fallbackCode, onOpenPending }: {
  count: number | undefined;
  issues: ReaderImportIssue[];
  sources?: Record<string, ReaderIssueSource> | null;
  fallbackCode?: string;
  onOpenPending: (id: string) => void;
}) {
  if (!count) return count === 0 ? "0" : "—";
  const code = issues[0]?.codes[0] ?? fallbackCode;
  return (
    <details>
      <summary style={{ cursor: "pointer", color: "#92400e" }}>
        <strong>{count.toLocaleString("vi-VN")}</strong> · {code ? describeIssue(code) : "Chưa có mô tả"} · <span style={{ textDecoration: "underline" }}>Xem chi tiết</span>
      </summary>
      {issues.length > 0 && <ol style={{ margin: "6px 0", paddingLeft: 20, listStyle: "decimal" }}>
        {issues.map((issue, index) => {
          const source = issue.sourceMessageId && sources && Object.hasOwn(sources, issue.sourceMessageId)
            ? sources[issue.sourceMessageId] : undefined;
          return (
            <li key={index} style={{ marginBottom: 8 }}>
              <strong>{issue.kind === "partial" ? "Bản chờ duyệt có cảnh báo" : issue.sourceMessageId ? "Chưa tạo bản chờ duyệt mới" : "Lỗi lần quét"}</strong>
              {issue.sourceMessageId && <div>Mã tin Zalo <code>{issue.sourceMessageId}</code></div>}
              {issue.codes.map(code => <div key={code}>{describeIssue(code)} <small>({code})</small></div>)}
              {source?.address && <div><strong>Địa chỉ từ tin:</strong> {source.address}</div>}
              {source && <div style={{ marginTop: 6 }}>
                <strong>{source.kind === "message" ? "Tin gốc Zalo" : "Nội dung Reader dùng để nhập"}</strong>
                <pre style={{ margin: "4px 0 8px", padding: 8, whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "#f8fafc", borderRadius: 6, fontFamily: "inherit", userSelect: "text" }}>{source.text}</pre>
                {source.truncated && <small>Tin dài, báo cáo chỉ lưu phần đầu.</small>}
              </div>}
              {issue.pendingIds?.map(id => <div key={id}>
                <button type="button" onClick={() => onOpenPending(id)} style={{ color: "#075985", textDecoration: "underline" }}>
                  {issue.kind === "failed" ? "Mở bản chờ duyệt đang có" : "Mở bản chờ duyệt"} · {id.slice(0, 8)}
                </button>
              </div>)}
            </li>
          );
        })}
      </ol>}
      {issues.length < count && <p style={{ margin: "6px 0" }}>
        {issues.length === 0 ? "Lượt quét này chưa lưu danh sách lỗi chi tiết." : `Đã lưu chi tiết ${issues.length}/${count} mục.`}
      </p>}
    </details>
  );
}

export default function ZaloReaderStatus({ onOpenPending }: { onOpenPending: (id: string) => void }) {
  const [groups,setGroups] = useState<any[]>([]); const [error,setError] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => { try {
      const response = await fetch("/api/admin/zalo-reader/status", { cache: "no-store" }); const body = await response.json();
      if (active) { setError(!response.ok || !body.ok); setGroups(body.groups || []); }
    } catch { if (active) setError(true); } };
    void refresh(); const timer = setInterval(refresh,60000); return () => { active=false; clearInterval(timer); };
  },[]);
  const time = (date?: string | null) => date ? new Date(date).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "Chưa có";
  return <section style={{ margin:"12px 0",padding:12,border:"1px solid #cbd5e1",borderRadius:10,background:"#fff",color:"#0f172a",overflowWrap:"anywhere" }}>
    <strong>Zalo Reader · tự động cách nhau 60 phút</strong>
    <ZaloReaderControls reportOpen={reportOpen} onToggleReport={() => setReportOpen(open => !open)} />
    <section id="zalo-import-report" hidden={!reportOpen} aria-labelledby="zalo-import-report-title" style={{ marginBottom: 16 }}>
      <h2 id="zalo-import-report-title" style={{ fontWeight: 700 }}>Báo cáo đọc phòng Zalo</h2>
      <p style={{ margin: "4px 0 8px", fontSize: 13 }}>
        Số liệu theo lần quét gần nhất của từng nhóm. Dấu — là chưa có số liệu cho chỉ số đó.
      </p>
      {groups.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 360, borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                <th scope="col" style={{ padding: 8 }}>Chỉ số</th>
                {groups.map(group => <th scope="col" key={group.group_key} style={{ padding: 8 }}>
                  {group.group_name}<br />
                  <span style={{ fontWeight: 400 }}>{time(group.run?.started_at)}{group.run?.mode === "trial" ? " · TEST" : ""}{group.run?.status === "running" ? " · Đang quét" : ""}</span>
                </th>)}
              </tr>
            </thead>
            <tbody>
              {reportCounters.map(([key, label]) => <tr key={key} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <th scope="row" style={{ padding: 8, textAlign: "left", fontWeight: 500 }}>{label}</th>
                {groups.map(group => <td key={group.group_key} style={{ padding: 8, verticalAlign: "top" }}>
                  {key === "failed" || key === "pending_with_issues"
                    ? <ImportIssueCount
                      count={group.run?.counters?.[key]}
                      issues={(group.run?.counters?.import_issues ?? []).filter((issue: ReaderImportIssue) => issue.kind === (key === "failed" ? "failed" : "partial"))}
                      sources={group.run?.import_issue_sources}
                      fallbackCode={key === "failed" ? group.run?.error_code : undefined}
                      onOpenPending={onOpenPending}
                    />
                    : group.run?.counters?.[key]?.toLocaleString("vi-VN") ?? "—"}
                </td>)}
              </tr>)}
            </tbody>
          </table>
        </div>
      ) : <p>{error ? "Chưa tải được báo cáo." : "Chưa có số liệu từ Reader."}</p>}
    </section>
    {error && <p>Chưa kết nối giám sát Reader. Cần triển khai SQL/API hoặc kiểm tra kết nối.</p>}
    <div style={{ display:"flex",flexWrap:"wrap",gap:16 }}>
      {groups.map(group => <div key={group.group_key} style={{ flex:"1 1 280px" }}>
        <b>{group.group_name}</b><div>{group.health.state === "running" ? "Đang chạy" : group.health.state === "error" ? "Cần kiểm tra" : "Đang chờ"} · Lịch {group.scheduler_enabled ? "bật" : "tắt"}</div>
        <div>Lần quét: {time(group.run?.started_at)}</div>
        <div>Dự kiến: {group.scheduler_enabled ? time(group.next_expected_at || group.health.nextAt) : "Chưa bật lịch"}</div>
        <div>Pending mới: {group.run?.counters?.pending_created || 0}{group.run?.mode === "trial" ? " (TEST)" : ""}</div>
        {!group.group_id && <div>Cần xác minh Group ID bằng Zalo Web.</div>}
        {group.health.stale && <div style={{color:"#b45309"}}>Chưa quét hoặc đã quá 2 giờ chưa có lượt mới.</div>}
        {group.run?.error_code && <div>{group.run.error_code}</div>}
      </div>)}
    </div>
    <details><summary>Chạy thủ công trên máy Windows của Reader</summary><code>npm run zalo-reader:production</code><p>Chạy một lượt ngay, không chờ 60 phút và không cần bật lịch tự động. Không chạy đồng thời hai lượt Reader.</p></details>
  </section>;
}
