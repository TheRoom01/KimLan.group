"use client";
import { useEffect, useState } from "react";
export default function ZaloReaderStatus() {
  const [groups,setGroups] = useState<any[]>([]); const [error,setError] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => { try {
      const response = await fetch("/api/admin/zalo-reader/status", { cache: "no-store" }); const body = await response.json();
      if (active) { setError(!response.ok || !body.ok); setGroups(body.groups || []); }
    } catch { if (active) setError(true); } };
    void refresh(); const timer = setInterval(refresh,60000); return () => { active=false; clearInterval(timer); };
  },[]);
  const time = (date: any) => date ? new Date(date).toLocaleString("vi-VN") : "Chưa có";
  return <section style={{ margin:"12px 0",padding:12,border:"1px solid #cbd5e1",borderRadius:10,background:"#fff",color:"#0f172a",overflowWrap:"anywhere" }}>
    <strong>Zalo Reader · tự động cách nhau 60 phút</strong>
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
