"use client";

type Props = {
  phone: string;
  zaloUrl: string;
  onUnlocked?: () => void;
};

export default function AnonymousLockModal({
  phone,
  zaloUrl,
  onUnlocked,
}: Props) {

    const unlockFor24Hours = () => {
    localStorage.setItem(
      "anon_lock_dismiss_until",
      String(Date.now() + 24 * 60 * 60 * 1000)
    );
  };

  return (
    <div
      className="
        fixed inset-0 z-[20000]
        flex items-center justify-center
        bg-black/50
        backdrop-blur-[14px]
      "
    >
      <div
        className="
          w-[92%] max-w-[520px]
          rounded-3xl
          border border-white/10
          bg-[#1b120d]
          p-8
          text-center
          shadow-[0_30px_80px_rgba(0,0,0,0.6)]
        "
      >
        <div className="mb-3 text-3xl">
          🏠
        </div>

        <h2 className="text-2xl font-bold text-[#E5C9A9]">
          Bạn đang xem phiên bản Khách Hàng
        </h2>

        <p className="mt-4 text-sm leading-7 text-[#d5c4b2]">
          Liên hệ Admin để được hỗ trợ tìm phòng NHANH HƠN,
          và đúng ngân sách.
        </p>

        <div
          className="
            mt-6
            rounded-2xl
            border border-[#E5C9A9]/20
            bg-white/5
            p-4
          "
        >
          <div className="text-xs text-[#A0856E]">
            SỐ ĐIỆN THOẠI ADMIN
          </div>

          <div className="mt-2 text-2xl font-bold text-[#E5C9A9]">
            {phone}
          </div>
        </div>

     <div className="mt-6 flex flex-col gap-3">
        <a
            href={zaloUrl}
            onClick={unlockFor24Hours}
            target="_blank"
            rel="noopener noreferrer"
            className="
            rounded-2xl
            bg-[#E5C9A9]
            px-5 py-4
            text-center
            text-base
            font-bold
            text-black

            shadow-[0_10px_30px_rgba(229,201,169,0.25)]
            hover:scale-[1.02]
            transition-all
            "
        >
            💬 Chat Zalo
        </a>

        <a
            href={`tel:${phone}`}
            onClick={unlockFor24Hours}
            className="
            rounded-2xl
            border border-[#E5C9A9]/30
            px-5 py-3
            text-center
            font-semibold
            text-[#E5C9A9]

            hover:bg-white/5
            transition-all
            "
        >
            📞 Gọi ngay
        </a>
        </div>
      </div>
    </div>
  );
}