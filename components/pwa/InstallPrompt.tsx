"use client";

import { Download, PlusSquare, Share2, X } from "lucide-react";
import { useEffect, useState } from "react";

const DISMISSED_UNTIL_KEY = "pwa-install-prompt-dismissed-until";
const INSTALLED_KEY = "pwa-installed";

const PROMPT_DELAY_MS = 10_000;
const DISMISS_DURATION_MS = 3 * 24 * 60 * 60 * 1_000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

function isInstalled() {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as NavigatorWithStandalone).standalone === true ||
      window.localStorage.getItem(INSTALLED_KEY) === "true"
    );
  } catch {
    return false;
  }
}

function isIosSafari() {
  const userAgent = navigator.userAgent;

  const isIos =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const isSafari =
    /Safari/.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);

  return isIos && isSafari;
}

function isDismissed() {
  try {
    const dismissedUntil = Number(
      window.localStorage.getItem(DISMISSED_UNTIL_KEY)
    );

    return (
      Number.isFinite(dismissedUntil) &&
      dismissedUntil > Date.now()
    );
  } catch {
    return false;
  }
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  const [delayElapsed, setDelayElapsed] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [iosSafari, setIosSafari] = useState(false);


  useEffect(() => {
    if (isInstalled() || isDismissed()) {
      return;
    }

    const iosBrowser = isIosSafari();

    const timer = window.setTimeout(() => {
      setIosSafari(iosBrowser);
      setDelayElapsed(true);
    }, PROMPT_DELAY_MS);


    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();

      setDeferredPrompt(
        event as BeforeInstallPromptEvent
      );
    };


    const handleInstalled = () => {
      try {
        window.localStorage.setItem(
          INSTALLED_KEY,
          "true"
        );
      } catch {}

      setDeferredPrompt(null);
      setDismissed(true);
    };


    window.addEventListener(
      "beforeinstallprompt",
      captureInstallPrompt
    );

    window.addEventListener(
      "appinstalled",
      handleInstalled
    );


    return () => {
      window.clearTimeout(timer);

      window.removeEventListener(
        "beforeinstallprompt",
        captureInstallPrompt
      );

      window.removeEventListener(
        "appinstalled",
        handleInstalled
      );
    };

  }, []);


  const dismiss = () => {
    try {
      window.localStorage.setItem(
        DISMISSED_UNTIL_KEY,
        String(Date.now() + DISMISS_DURATION_MS)
      );
    } catch {}

    setDismissed(true);
    setShowIosGuide(false);
  };


  const install = async () => {

    if (iosSafari) {
      setShowIosGuide(true);
      return;
    }


    if (!deferredPrompt) {
      return;
    }


    await deferredPrompt.prompt();


    const { outcome } =
      await deferredPrompt.userChoice;


    setDeferredPrompt(null);


    if (outcome === "dismissed") {
      dismiss();
    }
  };


  const canInstall =
    iosSafari ||
    deferredPrompt !== null;


  if (
    dismissed ||
    !delayElapsed ||
    !canInstall
  ) {
    return null;
  }


  return (
    <aside
      aria-label="Cài đặt ứng dụng The Room"className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[100] mx-auto max-w-md rounded-2xl border border-[#956b45]/25 bg-[#fff9ef] p-4 text-[#4d3422] shadow-[0_18px_55px_rgba(53,34,18,0.25)]"
      
    >

      <button
        type="button"
        onClick={dismiss}
        aria-label="Đóng lời mời cài đặt"
        className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-[#80634a] transition hover:bg-[#f3e1c9] hover:text-[#4d3422]"
      >
        <X size={18}/>
      </button>


      <div className="flex items-start gap-3 pr-9">

        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#744722] text-[#fff8eb]">
          <Download size={21}/>
        </span>


        <div>
          <h2 className="font-bold">
            Cài đặt The Room SG
          </h2>

          <p className="mt-1 text-sm leading-5 text-[#80634a]">
            Truy cập nhanh hơn từ màn hình chính và sử dụng thuận tiện như một ứng dụng.
          </p>
        </div>

      </div>


      {showIosGuide ? (

        <div className="mt-4 rounded-xl bg-[#f8ead7] p-3 text-sm leading-6">

          <p className="font-semibold">
            Cài đặt trên Safari:
          </p>

          <ol className="mt-1 space-y-1 text-[#674b34]">

            <li className="flex items-center gap-2">
              <Share2 size={16}/>
              Nhấn nút Chia sẻ.
            </li>


            <li className="flex items-center gap-2">
              <PlusSquare size={16}/>
              Chọn "Thêm vào Màn hình chính".
            </li>

          </ol>

        </div>

      ) : (

        <button
          type="button"
          onClick={() => void install()}
          className="mt-4 w-full rounded-xl bg-[#744722] px-4 py-2.5 text-sm font-semibold text-[#fff8eb] transition hover:bg-[#623817]"
        >
          {iosSafari
            ? "Xem hướng dẫn cài đặt"
            : "Cài đặt ứng dụng"}
        </button>

      )}

    </aside>
  );
}