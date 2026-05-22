"use client";

import { useEffect, useState } from "react";
import ReloadableImage from "@/src/components/ReloadableImage";

type Props = {
  onOpenEnrollmentForm: () => void;
};

export default function EnrollmentAnnouncementModal({ onOpenEnrollmentForm }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!visible) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVisible(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [visible]);

  const handleEnroll = () => {
    setVisible(false);
    onOpenEnrollmentForm();
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="enrollment-announcement-title"
      onClick={() => setVisible(false)}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-3xl border-2 border-[#ffc94a]/80 bg-gradient-to-b from-[#073229] via-[#0f3c33] to-[#175244] shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#ffc94a]/15 blur-2xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-emerald-400/10 blur-2xl"
          aria-hidden
        />

        <button
          type="button"
          onClick={() => setVisible(false)}
          className="absolute right-3 top-3 z-10 rounded-full p-2 text-[#fdfaf3]/70 transition-colors hover:bg-white/10 hover:text-[#fdfaf3]"
          aria-label="Zamknij"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="px-6 pb-6 pt-8 text-center sm:px-8">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#073229] ring-2 ring-[#ffc94a]">
            <ReloadableImage
              src="/images/2zyrafa2.png"
              alt=""
              width={64}
              height={64}
              className="h-14 w-14 object-contain"
            />
          </div>

          <span className="mb-3 inline-block rounded-full bg-[#ffc94a] px-4 py-1 text-xs font-bold uppercase tracking-wide text-[#3b2a10]">
            Rok szkolny 2026/2027
          </span>

          <h2
            id="enrollment-announcement-title"
            className="text-2xl font-bold leading-tight text-[#ffc94a] sm:text-[1.65rem]"
          >
            Zapisy otwarte!
          </h2>

          <p className="mt-3 text-sm leading-relaxed text-[#fdfaf3] sm:text-base">
            Przyjmujemy zgłoszenia na zajęcia w roku szkolnym{" "}
            <strong className="font-semibold text-white">2026/2027</strong>. Wypełnij formularz — odezwiemy się i
            ustalimy szczegóły.
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleEnroll}
              className="w-full rounded-full bg-[#ffc94a] px-6 py-3.5 text-sm font-bold text-[#3b2a10] shadow-lg shadow-black/25 transition-colors hover:bg-[#ffd76f]"
            >
              Przejdź do formularza zapisu
            </button>
            <button
              type="button"
              onClick={() => setVisible(false)}
              className="w-full rounded-full border border-white/25 px-6 py-2.5 text-sm font-medium text-[#fdfaf3] transition-colors hover:bg-white/10"
            >
              Nie teraz
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
