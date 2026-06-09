import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { CSSProperties } from "react";

function card(title: string, value: number) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 20,
        background: "#fff",
      }}
    >
      <div
        style={{
          fontSize: 14,
          color: "#6b7280",
          marginBottom: 8,
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
        }}
      >
        {value.toLocaleString("vi-VN")}
      </div>
    </div>
  );
}

function reportCard(title: string, value: number, href: string) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 20,
          background: "#fff",
          cursor: "pointer",
          transition: "all .15s ease",
        }}
      >
        <div
          style={{
            fontSize: 14,
            color: "#6b7280",
            marginBottom: 8,
          }}
        >
          {title}
        </div>

        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
          }}
        >
          {value.toLocaleString("vi-VN")}
        </div>

        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "#2563eb",
          }}
        >
          Xem danh sách →
        </div>
      </div>
    </Link>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

const reportThRight: CSSProperties = {
  textAlign: "right",
  padding: 12,
  borderBottom: "1px solid #e5e7eb",
  borderLeft: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const reportTdRight: CSSProperties = {
  padding: 12,
  textAlign: "right",
  borderBottom: "1px solid #f3f4f6",
  borderLeft: "1px solid #f3f4f6",
  whiteSpace: "nowrap",
};

const reportTdRightBold: CSSProperties = {
  ...reportTdRight,
  fontWeight: 600,
};

const reportThLeft: CSSProperties = {
  textAlign: "left",
  padding: 12,
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const reportTdLeft: CSSProperties = {
  padding: 12,
  borderBottom: "1px solid #f3f4f6",
  whiteSpace: "nowrap",
};

export default async function ReportsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: levelData } = await supabase.rpc("get_my_admin_level");

  const level = Number(levelData ?? 0);

  if (level !== 1) {
    redirect("/admin");
  }

  const { data: reportData, error } = await supabase.rpc(
    "reports_overview_v1"
  );

  const { data: topDistricts } = await supabase.rpc(
    "reports_top_districts_v1"
  );

  const { data: topAdmins } = await supabase.rpc("reports_top_admins_v1");

  const { data: dataHealth } = await supabase.rpc(
    "reports_data_health_v1"
  );

  if (error) {
    throw new Error(error.message);
  }

  const stats = reportData ?? {
    total: 0,
    available: 0,
    rented: 0,
    hidden: 0,
  };

  const health = dataHealth?.[0] ?? {
    no_zalo: 0,
    no_coordinates: 0,
    no_owner_phone: 0,
    no_media: 0,
  };

  const districtRows = topDistricts ?? [];

  const roomTypeColumns = [
    "Studio",
    "1 Phòng ngủ",
    "2 Phòng ngủ",
    "3 Phòng ngủ",
    "4 Phòng ngủ",
    "Duplex",
    "Tách bếp",
  ];

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 1400,
        margin: "0 auto",
      }}
    >
      <h1
        style={{
          fontSize: 32,
          fontWeight: 700,
          marginBottom: 24,
        }}
      >
        Reports
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        {card("Tổng phòng", Number(stats.total ?? 0))}
        {card("Đang trống", Number(stats.available ?? 0))}
        {card("Đã thuê", Number(stats.rented ?? 0))}
        {card("Đã ẩn", Number(stats.hidden ?? 0))}
      </div>

      <div
        style={{
          marginTop: 32,
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <div
          style={{
            padding: 16,
            fontSize: 20,
            fontWeight: 700,
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          Top quận nhiều phòng nhất
        </div>

        

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: 1100,
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    padding: 12,
                    borderBottom: "1px solid #e5e7eb",
                    whiteSpace: "nowrap",
                    position: "sticky",
                    left: 0,
                    background: "#fff",
                    zIndex: 2,
                    borderRight: "1px solid #e5e7eb",
                  }}
                >
                  Quận
                </th>

                <th style={reportThRight}>Tổng phòng</th>
                <th style={reportThRight}>Đang trống</th>
                <th style={reportThRight}>Đã thuê</th>
                <th style={reportThRight}>Đã ẩn</th>
                <th style={reportThRight}>Tỷ lệ thuê</th>

                {roomTypeColumns.map((type) => (
                  <th key={type} style={reportThRight}>
                    {type}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {districtRows.map((row: any) => {
                const total = Number(row.total ?? 0);
                const available = Number(row.available ?? 0);
                const rented = Number(row.rented ?? 0);
                const hidden = Number(row.hidden ?? 0);
                const rentedRate = Number(row.rented_rate ?? 0);

                return (
                  <tr key={row.district}>
                    <td
                      style={{
                        ...reportTdLeft,
                        position: "sticky",
                        left: 0,
                        background: "#fff",
                        zIndex: 1,
                        fontWeight: 600,
                        borderRight: "1px solid #f3f4f6",
                      }}
                    >
                      {row.district}
                    </td>

                    <td style={reportTdRightBold}>
                      {total.toLocaleString("vi-VN")}
                    </td>

                    <td style={reportTdRight}>
                      {available.toLocaleString("vi-VN")}
                    </td>

                    <td style={reportTdRight}>
                      {rented.toLocaleString("vi-VN")}
                    </td>

                    <td style={reportTdRight}>
                      {hidden.toLocaleString("vi-VN")}
                    </td>

                    <td style={reportTdRight}>
                      {rentedRate.toLocaleString("vi-VN")}%
                    </td>

                    {roomTypeColumns.map((type) => (
                      <td key={type} style={reportTdRight}>
                        {Number(
                          row.room_types?.[type] ?? 0
                        ).toLocaleString("vi-VN")}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

              <div
        style={{
          marginTop: 32,
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <div
          style={{
            padding: 16,
            fontSize: 20,
            fontWeight: 700,
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          Top Admins
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: 780,
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    padding: 12,
                    textAlign: "left",
                    borderBottom: "1px solid #e5e7eb",
                    borderRight: "1px solid #e5e7eb",
                    whiteSpace: "nowrap",
                  }}
                >
                  Admin
                </th>

                <th
                  style={{
                    padding: 12,
                    textAlign: "center",
                    borderBottom: "1px solid #e5e7eb",
                    borderRight: "1px solid #e5e7eb",
                    whiteSpace: "nowrap",
                  }}
                >
                  Level
                </th>

                <th
                  style={{
                    padding: 12,
                    textAlign: "center",
                    borderBottom: "1px solid #e5e7eb",
                    borderRight: "1px solid #e5e7eb",
                    whiteSpace: "nowrap",
                  }}
                >
                  SĐT
                </th>

                <th
                  style={{
                    ...reportThRight,
                    borderRight: "1px solid #e5e7eb",
                  }}
                >
                  Tổng phòng
                </th>

                <th style={reportThRight}>Ngày gia nhập</th>
              </tr>
            </thead>

            <tbody>
              {(topAdmins ?? []).map((row: any) => {
                const total = Number(row.total_rooms ?? 0);

                return (
                  <tr key={row.email}>
                    <td
                      style={{
                        padding: 12,
                        borderBottom: "1px solid #f3f4f6",
                        borderRight: "1px solid #f3f4f6",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {row.full_name || "-"}
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          color: "#6b7280",
                        }}
                      >
                        {row.email}
                      </div>
                    </td>

                    <td
                      style={{
                        padding: 12,
                        textAlign: "center",
                        borderBottom: "1px solid #f3f4f6",
                        borderRight: "1px solid #f3f4f6",
                        whiteSpace: "nowrap",
                      }}
                    >
                      L{row.level}
                    </td>

                    <td
                      style={{
                        padding: 12,
                        textAlign: "center",
                        borderBottom: "1px solid #f3f4f6",
                        borderRight: "1px solid #f3f4f6",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.phone || "-"}
                    </td>

                    <td
                      style={{
                        ...reportTdRightBold,
                        borderRight: "1px solid #f3f4f6",
                      }}
                    >
                      {total.toLocaleString("vi-VN")}
                    </td>

                    <td style={reportTdRight}>
                      {formatDate(row.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div
        style={{
          marginTop: 32,
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <div
          style={{
            padding: 16,
            fontSize: 20,
            fontWeight: 700,
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          Data Health
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 16,
            padding: 16,
          }}
        >
          {reportCard(
            "Không có Zalo",
            Number(health.no_zalo ?? 0),
            "/admin?report=no_zalo"
          )}

          {reportCard(
            "Không có tọa độ",
            Number(health.no_coordinates ?? 0),
            "/admin?report=no_coordinates"
          )}

          {reportCard(
            "Không có SĐT chủ",
            Number(health.no_owner_phone ?? 0),
            "/admin?report=no_owner_phone"
          )}

          {reportCard(
            "Không có ảnh",
            Number(health.no_media ?? 0),
            "/admin?report=no_media"
          )}
        </div>
      </div>
    </main>
  );
}