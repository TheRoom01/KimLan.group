import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";

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

function reportCard(
  title: string,
  value: number,
  href: string
) {
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

export default async function ReportsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: levelData } = await supabase.rpc(
    "get_my_admin_level"
  );

  const level = Number(levelData ?? 0);

  if (level !== 1) {
    redirect("/admin");
  }

  const { data: reportData, error } =
    await supabase.rpc("reports_overview_v1");

  const { data: topDistricts } =
  await supabase.rpc("reports_top_districts_v1");

  const { data: topAdmins } =
    await supabase.rpc("reports_top_admins_v1");
    
  const { data: dataHealth } =
    await supabase.rpc("reports_data_health_v1");

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
          gridTemplateColumns:
            "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        {card("Tổng phòng", stats.total)}
        {card("Đang trống", stats.available)}
        {card("Đã thuê", stats.rented)}
        {card("Đã ẩn", stats.hidden)}
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

  <table
    style={{
      width: "100%",
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
          }}
        >
          Quận
        </th>

        <th
          style={{
            textAlign: "right",
            padding: 12,
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          Số phòng
        </th>
      </tr>
    </thead>

    <tbody>
      {(topDistricts ?? []).map((row: any) => (
        <tr key={row.district}>
          <td
            style={{
              padding: 12,
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            {row.district}
          </td>

          <td
            style={{
              padding: 12,
              textAlign: "right",
              borderBottom: "1px solid #f3f4f6",
              fontWeight: 600,
            }}
          >
            {Number(row.total).toLocaleString("vi-VN")}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
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

  <table
    style={{
      width: "100%",
      borderCollapse: "collapse",
    }}
  >
    <thead>
      <tr>
        <th style={{ padding: 12, textAlign: "left" }}>
          Admin
        </th>

        <th style={{ padding: 12, textAlign: "center" }}>
          Level
        </th>

        <th style={{ padding: 12, textAlign: "center" }}>
          SĐT
        </th>

        <th style={{ padding: 12, textAlign: "right" }}>
          Tổng phòng
        </th>

        <th style={{ padding: 12, textAlign: "right" }}>
          Đã thuê
        </th>

        <th style={{ padding: 12, textAlign: "right" }}>
          Tỷ lệ thuê
        </th>
      </tr>
    </thead>

    <tbody>
      {(topAdmins ?? []).map((row: any) => {
        const total = Number(row.total_rooms ?? 0);
        const rented = Number(row.rented_rooms ?? 0);

        const ratio =
          total > 0
            ? ((rented / total) * 100).toFixed(1)
            : "0";

        return (
          <tr key={row.email}>
            <td
              style={{
                padding: 12,
                borderTop: "1px solid #f3f4f6",
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
                borderTop: "1px solid #f3f4f6",
              }}
            >
              L{row.level}
            </td>

            <td
              style={{
                padding: 12,
                textAlign: "center",
                borderTop: "1px solid #f3f4f6",
              }}
            >
              {row.phone || "-"}
            </td>

            <td
              style={{
                padding: 12,
                textAlign: "right",
                borderTop: "1px solid #f3f4f6",
                fontWeight: 600,
              }}
            >
              {total.toLocaleString("vi-VN")}
            </td>

            <td
              style={{
                padding: 12,
                textAlign: "right",
                borderTop: "1px solid #f3f4f6",
              }}
            >
              {rented.toLocaleString("vi-VN")}
            </td>

            <td
              style={{
                padding: 12,
                textAlign: "right",
                borderTop: "1px solid #f3f4f6",
              }}
            >
              {ratio}%
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
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
      gridTemplateColumns:
        "repeat(auto-fit,minmax(220px,1fr))",
      gap: 16,
      padding: 16,
    }}
  >
    {reportCard(
      "Không có Zalo",
      Number(health.no_zalo),
      "/admin?report=no_zalo"
    )}

    {reportCard(
      "Không có tọa độ",
      Number(health.no_coordinates),
      "/admin?report=no_coordinates"
    )}

    {reportCard(
      "Không có SĐT chủ",
      Number(health.no_owner_phone),
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