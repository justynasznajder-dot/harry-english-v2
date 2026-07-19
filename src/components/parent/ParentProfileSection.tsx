'use client';

import { useCallback, useEffect, useState } from 'react';

type ProfileData = {
  address: string | null;
  city: string | null;
  zipCode: string | null;
  billingType: string;
  companyName: string | null;
  nip: string | null;
  pesel: string | null;
};

type Flash = { kind: 'success' | 'error'; message: string };

export default function ParentProfileSection() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileLocked, setProfileLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [changeMessage, setChangeMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/user/profile', { cache: 'no-store', credentials: 'include' });
      const data = (await r.json().catch(() => ({}))) as {
        profile?: ProfileData | null;
        profileLocked?: boolean;
      };
      if (r.ok) {
        setProfile(data.profile ?? null);
        setProfileLocked(Boolean(data.profileLocked));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitChangeRequest() {
    if (!changeMessage.trim()) {
      setFlash({ kind: 'error', message: 'Opisz proponowane zmiany.' });
      return;
    }
    setBusy(true);
    setFlash(null);
    try {
      const r = await fetch('/api/user/profile/change-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: changeMessage.trim() }),
      });
      const data = (await r.json().catch(() => ({}))) as { message?: string };
      if (!r.ok) {
        setFlash({ kind: 'error', message: data.message ?? 'Nie udało się wysłać prośby' });
        return;
      }
      setFlash({ kind: 'success', message: data.message ?? 'Prośba wysłana do szkoły.' });
      setChangeMessage('');
    } catch {
      setFlash({ kind: 'error', message: 'Błąd połączenia z serwerem' });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
        <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Profil i dane do faktury</h2>
        <p className="text-sm text-zinc-600">Ładowanie…</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
      <header>
        <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Profil i dane do faktury</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Dane użyte przy generowaniu umowy i faktur.
        </p>
      </header>

      {!profile ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          Uzupełnij dane do umowy w zakładce „Proces zapisu” przed generowaniem umowy.
        </div>
      ) : (
        <div className="grid gap-2 rounded-2xl border border-zinc-200 p-4 text-sm sm:grid-cols-[max-content_1fr]">
          <span className="font-semibold text-zinc-800">Adres:</span>
          <span>
            {profile.address ?? '—'}, {profile.zipCode ?? ''} {profile.city ?? ''}
          </span>
          {profile.billingType === 'company' ? (
            <>
              <span className="font-semibold text-zinc-800">Firma:</span>
              <span>{profile.companyName ?? '—'}</span>
              <span className="font-semibold text-zinc-800">NIP:</span>
              <span>{profile.nip ?? '—'}</span>
            </>
          ) : (
            <>
              <span className="font-semibold text-zinc-800">PESEL:</span>
              <span>{profile.pesel ? '•••••••••••' : '—'}</span>
            </>
          )}
        </div>
      )}

      {profileLocked ? (
        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-sm text-amber-950">
            Po wygenerowaniu umowy dane są zablokowane do edycji. Aby je zmienić, zgłoś prośbę do
            szkoły.
          </p>
          <textarea
            value={changeMessage}
            onChange={(e) => setChangeMessage(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            placeholder="Opisz, jakie dane należy zmienić (adres, PESEL/NIP, firma…)"
          />
          <button
            type="button"
            disabled={busy || !changeMessage.trim()}
            onClick={() => void submitChangeRequest()}
            className="rounded-full bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Wysyłanie…' : 'Zgłoś zmianę do szkoły'}
          </button>
        </div>
      ) : (
        <p className="text-sm text-zinc-600">
          Edycja danych jest dostępna w zakładce „Proces zapisu” przed wygenerowaniem umowy.
        </p>
      )}

      {flash ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            flash.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {flash.message}
        </div>
      ) : null}
    </section>
  );
}
