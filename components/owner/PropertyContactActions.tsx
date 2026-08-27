"use client";

import { ExternalLink, Mail, Phone, UserRound, X } from "lucide-react";
import { useState } from "react";

type OwnerContact = {
  id?: string | null;
  display_name?: string | null;
  email?: string | null;
};

export default function PropertyContactActions({
  phones,
  email,
  zaloUrl,
  owners,
}: {
  phones: string[];
  email?: string | null;
  zaloUrl?: string | null;
  owners: OwnerContact[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className={`grid w-full gap-2 ${zaloUrl ? "grid-cols-2" : "grid-cols-1"}`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-[#9a704b]/40 bg-[#fffdf8] px-2 text-center text-sm font-bold text-[#684324] transition hover:bg-[#f3e1c9]"
        >
          <Phone size={17} /> Thông tin liên hệ
        </button>
        {zaloUrl ? (
          <a
            href={zaloUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-[#9a704b]/40 bg-[#fffdf8] px-2 text-center text-sm font-bold text-[#684324] transition hover:bg-[#f3e1c9]"
          >
            <ExternalLink size={17} /> Nhóm Zalo
          </a>
        ) : null}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[700] grid place-items-center bg-black/45 p-3 backdrop-blur-sm"
          onMouseDown={() => setOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="property-contact-title"
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-5 text-[#432918] shadow-2xl sm:p-6"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="property-contact-title" className="text-xl font-bold">Thông tin liên hệ</h2>
              <button type="button" onClick={() => setOpen(false)} className="shrink-0 rounded-lg p-1.5 text-[#684324] hover:bg-[#f8ead7]" aria-label="Đóng"><X size={20} /></button>
            </div>

            <div className="mt-5 space-y-2 text-sm text-[#674b34]">
              {phones.length ? phones.map((phone) => (
                <a key={phone} href={`tel:${phone}`} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-[#f8ead7] hover:text-[#744722]"><ContactIcon><Phone size={16} /></ContactIcon><span>{phone}</span></a>
              )) : <ContactRow icon={<Phone size={16} />} text="Chưa cập nhật số điện thoại" />}
              {email ? <a href={`mailto:${email}`} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-[#f8ead7] hover:text-[#744722]"><ContactIcon><Mail size={16} /></ContactIcon><span className="min-w-0 break-all">{email}</span></a> : <ContactRow icon={<Mail size={16} />} text="Chưa cập nhật email" />}
            </div>

            {owners.length ? <div className="mt-5 border-t border-[#956b45]/20 pt-4"><h3 className="text-sm font-bold">Chủ tòa nhà</h3><div className="mt-2 space-y-2">{owners.map((owner, index) => <div key={owner.id || index} className="flex items-center gap-3 rounded-xl bg-[#f8ead7]/70 p-3"><ContactIcon><UserRound size={16} /></ContactIcon><div className="min-w-0"><p className="font-semibold text-[#4d3422]">{owner.display_name || owner.email || `Chủ tòa nhà ${index + 1}`}</p>{owner.display_name && owner.email ? <p className="mt-0.5 break-all text-xs text-[#80634a]">{owner.email}</p> : null}</div></div>)}</div></div> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

function ContactIcon({ children }: { children: React.ReactNode }) {
  return <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#f3e1c9] text-[#744722]">{children}</span>;
}

function ContactRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="flex items-center gap-3 rounded-xl p-2"><ContactIcon>{icon}</ContactIcon><span>{text}</span></div>;
}
