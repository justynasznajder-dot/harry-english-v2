"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "cookie-consent";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const consent = localStorage.getItem(STORAGE_KEY);
    if (consent !== "accepted") {
      setVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(STORAGE_KEY, "accepted");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Informacja o ciasteczkach"
      className="fixed bottom-0 left-0 right-0 z-50 px-4 py-4 sm:px-6"
    >
      <div className="mx-auto max-w-4xl rounded-2xl border border-[#05231d] bg-gradient-to-b from-[#073229] to-[#0f3c33] px-5 py-4 shadow-[0_-8px_25px_rgba(0,0,0,0.35)] sm:flex sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-5">
        <p className="text-sm text-[#fdfaf3] sm:text-base">
          Ta strona korzysta z ciasteczek (cookies) w celach technicznych – aby zapewnić działanie
          logowania i zachowanie sesji. Korzystając ze strony, wyrażasz zgodę na ich używanie.
        </p>
        <button
          type="button"
          onClick={handleAccept}
          className="mt-4 shrink-0 rounded-full bg-[#ffc94a] px-6 py-2.5 text-sm font-semibold text-[#3b2a10] shadow-md transition-colors hover:bg-[#ffd76f] sm:mt-0"
        >
          Akceptuję
        </button>
      </div>
    </div>
  );
}
