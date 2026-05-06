'use client';

import { useState } from "react";

interface ContractPortalProps {
  contract: {
    id: string;
    content_html: string;
    status: string;
  } | null;
  onSigned: () => void;
}

export default function ContractPortal({ contract, onSigned }: ContractPortalProps) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  const signContract = async () => {
    if (!accepted) return;
    setBusy(true);
    try {
      const res = await fetch("/api/enrollment/sign", { method: "POST" });
      if (!res.ok) throw new Error("Podpis nie powiódł się");
      onSigned();
    } catch (e) {
      alert("Nie udało się podpisać umowy.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[#f8f6f3] rounded-3xl p-8 shadow-xl">
      <h2 className="text-3xl font-bold text-[#1f2933] mb-4">Umowa</h2>

      {contract ? (
        <div
          className="rounded-xl border border-gray-200 bg-white p-5 prose max-w-none"
          dangerouslySetInnerHTML={{ __html: contract.content_html }}
        />
      ) : (
        <p className="text-[#4b5563]">Brak umowy do podpisu.</p>
      )}

      <label className="flex items-center gap-2 mt-6">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        <span>Zapoznałem/am się z treścią umowy</span>
      </label>

      <button
        onClick={signContract}
        disabled={!accepted || !contract || busy}
        className="mt-4 px-6 py-3 bg-[#175244] text-white rounded-full font-semibold disabled:opacity-50"
      >
        Akceptuję warunki
      </button>
    </div>
  );
}
