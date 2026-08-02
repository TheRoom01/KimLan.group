"use client";

import Link from "next/link";
import { BarChart3 } from "lucide-react";

export type OwnerPropertyDashboardItem = {
  id: string;
  code: string | null;
  name: string;
  houseNumber: string | null;
  address: string | null;
  ward: string | null;
  district: string | null;
  city: string | null;
  fullAddress: string;
  total: number;
  rented: number;
  empty: number;
  upcoming: number;
  monthlyRevenue: number;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Dùng căn bậc hai để nén chênh lệch.
 *
 * Ví dụ tòa nhà có 100 phòng không tạo cột cao gấp
 * 100 lần tòa nhà có một phòng.
 */
function getBarHeight(
  value: number,
  maxValue: number,
) {
  if (value <= 0) {
    return 4;
  }

  const ratio =
    Math.sqrt(
      value / Math.max(maxValue, 1),
    );

  return Math.round(
    14 + ratio * 62,
  );
}

export default function OwnerPropertyDashboard({
  items,
}: {
  items: OwnerPropertyDashboardItem[];
}) {
  const maxRoomValue = Math.max(
    1,
    ...items.map((item) => item.total),
  );

  return (
    <>
      <section className="min-w-0 rounded-2xl border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:rounded-[22px] sm:p-6">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[#744923]">
                <BarChart3 size={20} />

                <h2 className="text-sm font-bold uppercase tracking-wide sm:text-lg">
                  Phòng trống mỗi tòa nhà
                </h2>
              </div>

            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-[#74583e]">
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm bg-[#929292]" />
                Tổng số phòng
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm bg-[#75451f]" />
                Phòng đang trống
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#846951]">
            <span>
              Hiển thị{" "}
              <strong className="text-[#5c3c26]">
                {items.length}
              </strong>{" "}
              trên {items.length} tòa nhà
            </span>

          </div>
        </div>

        {items.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-[#a9825f]/35 bg-[#f8ead7] px-5 py-10 text-center text-sm text-[#7d624b]">
            Không tìm thấy tòa nhà phù hợp với địa chỉ đã nhập.
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto pb-2">
            <div className="flex min-w-max items-stretch gap-3">
              {items.map((item) => {
                const emptyBarHeight = getBarHeight(
                  item.empty,
                  maxRoomValue,
                );
                const totalBarHeight = getBarHeight(
                  item.total,
                  maxRoomValue,
                );

                return (
                  <Link
                    key={item.id}
                    href={`/owner/properties/${item.id}`}
                    title={`${item.name}: ${item.empty} phòng trống trên tổng ${item.total} phòng`}
                    className="group flex w-[118px] shrink-0 flex-col rounded-2xl border border-[#a9825f]/20 bg-[#f8ead7] p-3 transition hover:-translate-y-0.5 hover:border-[#8b5a32]/35 hover:shadow-md sm:w-[128px]"
                  >
                    <div className="flex h-32 items-end justify-center gap-1">
                      <div className="flex h-full flex-col items-center justify-end">
                        <span className="mb-2 text-base font-bold leading-none text-[#626262]">
                          {item.total}
                        </span>

                        <div
                          className={`relative w-5 rounded-md bg-gradient-to-t from-[#777] to-[#aaa] shadow-[0_8px_18px_rgba(70,70,70,0.18)] transition group-hover:scale-105 ${item.total === 0 ? "opacity-30" : ""}`}
                          style={{ height: `${totalBarHeight}px` }}
                        />
                      </div>

                      <div className="flex h-full flex-col items-center justify-end">
                        <span className="mb-2 text-base font-bold leading-none text-[#52331f]">
                          {item.empty}
                        </span>

                        <div
                          className={`relative w-5 rounded-md bg-gradient-to-t from-[#5d3417] to-[#946038] shadow-[0_8px_18px_rgba(100,56,21,0.22)] transition group-hover:scale-105 ${item.empty === 0 ? "opacity-30" : ""}`}
                          style={{ height: `${emptyBarHeight}px` }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 min-w-0 border-t border-[#ad835d]/20 pt-3 text-center">
                      <p className="line-clamp-2 min-h-8 break-words text-[11px] font-bold leading-4 text-[#5f4631] sm:text-xs">
                        {item.name}
                      </p>

                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-[#956b45]/25 bg-[#fff9ef] shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:rounded-[22px]">
        <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[#4f321e] sm:text-lg">
              Tổng quan chi tiết tòa nhà
            </h2>

            <p className="mt-1 text-sm text-[#846951]">
              Công suất phòng và doanh thu dự kiến theo tháng.
            </p>
          </div>

          <Link
            href="/owner/properties"
            className="hidden shrink-0 text-sm font-semibold text-[#744722] hover:underline sm:inline-flex"
          >
            Xem danh sách
          </Link>
        </div>

        {items.length === 0 ? (
          <div className="border-t border-[#a77c55]/15 px-5 py-10 text-center text-sm text-[#80634a]">
            Không có tòa nhà phù hợp với tìm kiếm hiện tại.
          </div>
        ) : (
          <>
            <div className="hidden lg:block">
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <thead className="bg-[#754722] text-[#fff5e7]">
                  <tr>
                    <th className="w-[34%] px-4 py-3 font-semibold">
                      Tòa nhà
                    </th>

                    <th className="w-[18%] px-3 py-3 font-semibold">
                      Lấp đầy
                    </th>

                    <th className="px-2 py-3 text-center font-semibold">
                      Trống
                    </th>

                    <th className="px-2 py-3 text-center font-semibold">
                      Đang thuê
                    </th>

                    <th className="px-2 py-3 text-center font-semibold">
                      Sắp trống
                    </th>

                    <th className="w-[20%] px-4 py-3 text-right font-semibold">
                      Doanh thu
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {items.map((item, index) => {
                    const rate =
                      item.total > 0
                        ? Math.round((item.rented / item.total) * 100)
                        : 0;

                    return (
                      <tr
                        key={item.id}
                        className={`border-t border-[#b99673]/20 ${
                          index % 2 === 0
                            ? "bg-[#fffaf2]"
                            : "bg-[#f6e8d5]"
                        }`}
                      >
                        <td className="px-4 py-3.5">
                          <Link
                            href={`/owner/properties/${item.id}`}
                            className="block min-w-0 hover:underline"
                          >
                            <span className="line-clamp-1 break-words font-semibold text-[#4d3422]">
                              {item.name}
                            </span>

                          </Link>
                        </td>

                        <td className="px-3 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="w-9 shrink-0 font-semibold text-[#61442f]">
                              {rate}%
                            </span>

                            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#dfc8a8]">
                              <div
                                className="h-full rounded-full bg-[#7a4b27]"
                                style={{
                                  width: `${Math.min(rate, 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="px-2 py-3.5 text-center font-bold text-[#744722]">
                          {item.empty}
                        </td>

                        <td className="px-2 py-3.5 text-center">
                          {item.rented}
                        </td>

                        <td className="px-2 py-3.5 text-center">
                          {item.upcoming}
                        </td>

                        <td className="break-words px-4 py-3.5 text-right font-semibold text-[#5c3d27]">
                          {formatCurrency(item.monthlyRevenue)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 border-t border-[#a77c55]/15 p-3 lg:hidden">
              {items.map((item) => {
                const rate =
                  item.total > 0
                    ? Math.round((item.rented / item.total) * 100)
                    : 0;

                return (
                  <Link
                    key={item.id}
                    href={`/owner/properties/${item.id}`}
                    className="block min-w-0 rounded-2xl border border-[#a87d56]/20 bg-[#f8ead7] p-4 transition hover:bg-[#f2dfc4]"
                  >
                    <div className="min-w-0">
                      <p className="break-words font-bold text-[#4d3422]">
                        {item.name}
                      </p>

                      <p className="mt-2 text-xs text-[#80634a]">
                        {item.total} phòng · {rate}% lấp đầy
                      </p>

                      <p className="mt-2 break-words text-sm font-semibold text-[#684324]">
                        {formatCurrency(item.monthlyRevenue)}/tháng
                      </p>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                      <MiniMetric
                        label="Đang thuê"
                        value={item.rented}
                      />

                      <MiniMetric
                        label="Đang trống"
                        value={item.empty}
                      />

                      <MiniMetric
                        label="Sắp trống"
                        value={item.upcoming}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </section>
    </>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-[#fff8ed] px-1.5 py-2.5 sm:px-2">
      <p className="font-bold text-[#5d3d27]">{value}</p>

      <p className="mt-1 break-words text-[10px] leading-3 text-[#8a6b50]">
        {label}
      </p>
    </div>
  );
}
