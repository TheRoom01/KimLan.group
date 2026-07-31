"use client";

import { useState } from "react";

type RoomStatusLog = {
  id: string;
  old_status?: string | null;
  new_status?: string | null;
  changed_by?: string | null;
  changed_by_name?: string | null;
  changed_by_source?: "admin" | "owner" | null;
  note?: string | null;
  changed_at: string;
};

interface Props {
  logs: RoomStatusLog[];
}

export default function RoomStatusHistory({ logs }: Props) {
  const [expanded, setExpanded] = useState(false);

  const visibleLogs = expanded ? logs : logs.slice(0, 1);

  return (
    <div className="rounded-xl border bg-white p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          Lịch sử trạng thái
        </h2>

        {logs.length > 1 ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-sm font-semibold text-blue-600 hover:underline"
          >
            {expanded ? "Thu gọn" : "Xem thêm"}
          </button>
        ) : null}
      </div>

      {logs.length === 0 ? (
        <p className="text-gray-500">
          Chưa có thay đổi trạng thái.
        </p>
      ) : (
        <div className="space-y-5">
          {visibleLogs.map((log) => (
            <div
              key={log.id}
              className="border-l-4 border-blue-500 pl-4"
            >
              <p className="font-semibold">
                {log.old_status} → {log.new_status}
              </p>

              {log.note ? (
                <p className="text-sm text-gray-600">
                  Ghi chú: {log.note}
                </p>
              ) : null}

              {log.changed_by ? (
                <p className="text-sm text-gray-500">
                  Người thay đổi: {log.changed_by_name || "Không có đầy đủ thông tin hồ sơ"}
                </p>
              ) : null}

              <p className="text-xs text-gray-400">
                {new Date(log.changed_at).toLocaleString("vi-VN")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
