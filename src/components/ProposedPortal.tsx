'use client';

import { useState } from "react";

interface ProposedPortalProps {
  proposal: {
    group_name: string;
    location_name: string;
    schedule: string;
    price_monthly?: number | null;
  } | null;
  onAccepted: () => void;
}

export default function ProposedPortal({ proposal, onAccepted }: ProposedPortalProps) {
  const [busy, setBusy] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [message, setMessage] = useState("");

  const accept = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/enrollment/accept", { method: "PUT" });
      if (!res.ok) throw new Error("Nie udało się zaakceptować propozycji");
      onAccepted();
    } catch (e) {
      alert("Nie udało się zaakceptować propozycji.");
    } finally {
      setBusy(false);
    }
  };

  const sendContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: "inne",
        message: `Prośba o zmianę terminu: ${message.trim()}`,
      }),
    });
    setShowContact(false);
    setMessage("");
    alert("Wiadomość została wysłana.");
  };

  return (
    <div className="bg-[#f8f6f3] rounded-3xl p-8 shadow-xl">
      <h2 className="text-3xl font-bold text-[#1f2933] mb-4">Propozycja grupy</h2>
      {proposal ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <p><strong>Grupa:</strong> {proposal.group_name}</p>
          <p><strong>Lokalizacja:</strong> {proposal.location_name}</p>
          <p><strong>Dzień/godzina:</strong> {proposal.schedule}</p>
          <p><strong>Cena:</strong> {proposal.price_monthly ?? "Do ustalenia"} zł / miesiąc</p>
        </div>
      ) : (
        <p className="text-[#4b5563]">Brak aktywnej propozycji.</p>
      )}

      <div className="flex gap-3 mt-6">
        <button
          onClick={accept}
          disabled={busy || !proposal}
          className="px-5 py-3 bg-[#175244] text-white rounded-full font-semibold disabled:opacity-50"
        >
          Akceptuję termin
        </button>
        <button
          onClick={() => setShowContact(true)}
          className="px-5 py-3 bg-[#ffc94a] text-[#3b2a10] rounded-full font-semibold"
        >
          Chcę inny termin
        </button>
      </div>

      {showContact && (
        <form onSubmit={sendContact} className="mt-6 space-y-3">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-3"
            rows={4}
            placeholder="Napisz, jakie terminy byłyby dla Ciebie lepsze..."
          />
          <button type="submit" className="px-5 py-2 bg-[#175244] text-white rounded-full">
            Wyślij prośbę
          </button>
        </form>
      )}
    </div>
  );
}
