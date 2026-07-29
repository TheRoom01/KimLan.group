const widths = ["w-2/3", "w-1/2", "w-5/6", "w-3/5", "w-4/5", "w-1/3"];

export default function OwnerLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl animate-pulse space-y-6 px-4 py-6" role="status" aria-label="Đang tải nội dung">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-3"><div className="h-8 w-56 rounded-xl bg-[#eadbc8]"/><div className="h-4 w-72 max-w-full rounded-lg bg-[#f3e1c9]"/></div>
        <div className="h-10 w-32 rounded-xl bg-[#dcc5aa]"/>
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[#f3e1c9]/80 p-1">{[0,1,2].map(item=><div key={item} className="h-10 rounded-xl bg-[#eadbc8]"/>)}</div>
      <div className="rounded-2xl border border-[#aa825d]/20 bg-[#fff9ef] p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{widths.map((width,index)=><div key={index} className="rounded-xl border border-[#aa825d]/15 bg-white p-3"><div className={`mb-3 h-3 rounded bg-[#eadbc8] ${width}`}/><div className="h-11 rounded-xl bg-[#f6eee3]"/></div>)}</div>
      </div>
      <span className="sr-only">Đang tải...</span>
    </div>
  );
}
