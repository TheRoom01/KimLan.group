function Pulse({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-xl bg-[#dfc8a8]/55 ${className}`}
    />
  );
}

export function PageLoadingSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="status"
      aria-label="Đang tải nội dung"
      className="mx-auto w-full min-w-0 max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8"
    >
      <span className="sr-only">Đang tải nội dung...</span>
      <div className="space-y-5">
        <div className="space-y-2">
          <Pulse className="h-8 w-48 max-w-[65vw]" />
          <Pulse className="h-4 w-72 max-w-[85vw]" />
        </div>
        <div
          className={`grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 ${
            compact ? "sm:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-3"
          }`}
        >
          {Array.from({ length: compact ? 6 : 3 }, (_, index) => (
            <div
              key={index}
              className="min-w-0 overflow-hidden rounded-[22px] border border-[#956b45]/15 bg-[#fff9ef] p-4"
            >
              <Pulse className="aspect-[16/8] w-full" />
              <Pulse className="mt-4 h-6 w-3/4" />
              <Pulse className="mt-3 h-4 w-full" />
              <Pulse className="mt-2 h-4 w-2/3" />
              <div className="mt-5 grid grid-cols-3 gap-2">
                <Pulse className="h-14 w-full" />
                <Pulse className="h-14 w-full" />
                <Pulse className="h-14 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PanelLoadingSkeleton() {
  return (
    <div role="status" aria-label="Đang tải dữ liệu" className="space-y-4 p-4">
      <span className="sr-only">Đang tải dữ liệu...</span>
      <div className="flex items-center gap-3">
        <Pulse className="h-12 w-12 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Pulse className="h-5 w-2/3" />
          <Pulse className="h-3 w-1/2" />
        </div>
      </div>
      <Pulse className="h-20 w-full" />
      <Pulse className="h-20 w-full" />
      <Pulse className="h-12 w-full" />
    </div>
  );
}

export function OwnerDetailLoadingSkeleton({
  kind,
}: {
  kind: "property" | "room";
}) {
  const isProperty = kind === "property";

  return (
    <div
      role="status"
      aria-label={isProperty ? "Đang tải chi tiết tòa nhà" : "Đang tải chi tiết phòng"}
      className="w-full min-w-0 space-y-5 sm:space-y-6"
    >
      <span className="sr-only">
        {isProperty ? "Đang tải chi tiết tòa nhà..." : "Đang tải chi tiết phòng..."}
      </span>

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <Pulse className="h-3 w-28" />
          <Pulse className="h-9 w-72 max-w-[80vw]" />
          <Pulse className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Pulse className="h-10 w-28" />
          <Pulse className="h-10 w-28" />
        </div>
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <section className="min-w-0 rounded-[22px] border border-[#956b45]/15 bg-[#fff9ef] p-4 sm:p-5">
          <Pulse className={isProperty ? "h-52 w-full sm:h-64" : "h-64 w-full sm:h-80"} />
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Pulse className="h-20 w-full" />
            <Pulse className="h-20 w-full" />
            <Pulse className="h-20 w-full" />
            <Pulse className="h-20 w-full" />
          </div>
        </section>

        <aside className="min-w-0 rounded-[22px] border border-[#956b45]/15 bg-[#fff9ef] p-4 sm:p-5">
          <Pulse className="h-6 w-36" />
          <Pulse className="mt-5 h-14 w-full" />
          <Pulse className="mt-3 h-14 w-full" />
          <Pulse className="mt-3 h-14 w-full" />
          <Pulse className="mt-5 h-10 w-full" />
        </aside>
      </div>

      <section className="rounded-[22px] border border-[#956b45]/15 bg-[#fff9ef] p-4 sm:p-5">
        <Pulse className="h-7 w-52 max-w-[70vw]" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: isProperty ? 6 : 3 }, (_, index) => (
            <Pulse key={index} className="h-24 w-full" />
          ))}
        </div>
      </section>
    </div>
  );
}

export function RoomModalLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Đang tải chi tiết phòng"
      className="fixed inset-0 z-[99999] flex items-end justify-center bg-black/45 pt-[52px]"
    >
      <span className="sr-only">Đang tải chi tiết phòng...</span>
      <div className="h-[calc(100dvh-52px)] w-screen overflow-hidden rounded-t-[28px] border-x border-t border-white/15 bg-[#e9d7c3] p-3 shadow-[0_-24px_80px_rgba(0,0,0,0.55)] md:w-[720px] md:max-w-[calc(100vw-48px)]">
        <Pulse className="h-[300px] w-full md:h-[330px]" />
        <Pulse className="mt-4 h-7 w-3/4" />
        <Pulse className="mt-3 h-4 w-full" />
        <Pulse className="mt-2 h-4 w-2/3" />
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Pulse className="h-20 w-full" />
          <Pulse className="h-20 w-full" />
        </div>
      </div>
    </div>
  );
}
