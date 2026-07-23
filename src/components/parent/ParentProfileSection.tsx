'use client';

import { useCallback, useEffect, useState } from 'react';
import { validateParentContractProfileInput } from '@/lib/parent-contract-profile';

type BillingType = 'private' | 'company';

type ProfileForm = {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  city: string;
  zipCode: string;
  billingType: BillingType;
  companyName: string;
  nip: string;
  pesel: string;
};

type Flash = { kind: 'success' | 'error'; message: string };

const emptyForm = (): ProfileForm => ({
  firstName: '',
  lastName: '',
  phone: '',
  address: '',
  city: '',
  zipCode: '',
  billingType: 'private',
  companyName: '',
  nip: '',
  pesel: '',
});

export default function ParentProfileSection() {
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [hasProfile, setHasProfile] = useState(false);
  const [clientNumber, setClientNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/user/profile', { cache: 'no-store', credentials: 'include' });
      const data = (await r.json().catch(() => ({}))) as {
        profile?: {
          address?: string | null;
          city?: string | null;
          zipCode?: string | null;
          billingType?: string;
          companyName?: string | null;
          nip?: string | null;
          pesel?: string | null;
        } | null;
        user?: {
          firstName?: string;
          lastName?: string;
          phone?: string | null;
          clientNumber?: string | null;
        };
      };
      if (!r.ok) return;
      const p = data.profile;
      setHasProfile(Boolean(p));
      setClientNumber(data.user?.clientNumber ?? null);
      setForm({
        firstName: data.user?.firstName ?? '',
        lastName: data.user?.lastName ?? '',
        phone: data.user?.phone?.trim() ?? '',
        address: p?.address ?? '',
        city: p?.city ?? '',
        zipCode: p?.zipCode ?? '',
        billingType: p?.billingType === 'company' ? 'company' : 'private',
        companyName: p?.companyName ?? '',
        nip: p?.nip ?? '',
        pesel: p?.pesel ?? '',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patch(partial: Partial<ProfileForm>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  async function handleSave() {
    const validationError = validateParentContractProfileInput({
      billingType: form.billingType,
      address: form.address,
      city: form.city,
      zipCode: form.zipCode,
      pesel: form.pesel,
      companyName: form.companyName,
      nip: form.nip,
    });
    if (validationError) {
      setFlash({ kind: 'error', message: validationError });
      return;
    }
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setFlash({ kind: 'error', message: 'Podaj imię i nazwisko rodzica.' });
      return;
    }

    setSaving(true);
    setFlash(null);
    try {
      const r = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          billingType: form.billingType,
          address: form.address,
          city: form.city,
          zipCode: form.zipCode,
          pesel: form.billingType === 'private' ? form.pesel : null,
          companyName: form.billingType === 'company' ? form.companyName : null,
          nip: form.billingType === 'company' ? form.nip : null,
        }),
      });
      const data = (await r.json().catch(() => ({}))) as { message?: string };
      if (!r.ok) {
        setFlash({ kind: 'error', message: data.message ?? 'Nie udało się zapisać danych' });
        return;
      }
      setHasProfile(true);
      setFlash({
        kind: 'success',
        message: 'Dane zapisane. Będą używane przy przyszłych umowach i fakturach.',
      });
      await load();
    } catch {
      setFlash({ kind: 'error', message: 'Błąd połączenia z serwerem' });
    } finally {
      setSaving(false);
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
          Dane używane przy generowaniu umów i faktur.
        </p>
      </header>

      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
        Zmiana danych obowiązuje <strong>na przyszłość</strong> (kolejne umowy i faktury). Treść już
        podpisanych umów się nie zmienia.
      </div>

      {clientNumber ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
          Numer klienta: <span className="font-mono font-semibold">{clientNumber}</span>
        </div>
      ) : null}

      {!hasProfile ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          Nie masz jeszcze zapisanych danych do umowy — uzupełnij formularz poniżej.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-800">Imię</label>
          <input
            type="text"
            value={form.firstName}
            onChange={(e) => patch({ firstName: e.target.value })}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-800">Nazwisko</label>
          <input
            type="text"
            value={form.lastName}
            onChange={(e) => patch({ lastName: e.target.value })}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2"
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-zinc-800">Telefon</label>
          <input
            type="text"
            value={form.phone}
            onChange={(e) => patch({ phone: e.target.value })}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2"
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-zinc-800">Adres</label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => patch({ address: e.target.value })}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-800">Miasto</label>
          <input
            type="text"
            value={form.city}
            onChange={(e) => patch({ city: e.target.value })}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-800">Kod pocztowy</label>
          <input
            type="text"
            value={form.zipCode}
            onChange={(e) => patch({ zipCode: e.target.value })}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <p className="text-sm font-medium text-zinc-800">Rozliczenie</p>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="radio"
                name="billingType"
                checked={form.billingType === 'private'}
                onChange={() => patch({ billingType: 'private' })}
                className="accent-[#0f6e56]"
              />
              Osoba prywatna (PESEL)
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="radio"
                name="billingType"
                checked={form.billingType === 'company'}
                onChange={() => patch({ billingType: 'company' })}
                className="accent-[#0f6e56]"
              />
              Firma (NIP)
            </label>
          </div>
        </div>
        {form.billingType === 'private' ? (
          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium text-zinc-800">PESEL</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.pesel}
              onChange={(e) => patch({ pesel: e.target.value })}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2"
            />
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-800">Nazwa firmy</label>
              <input
                type="text"
                value={form.companyName}
                onChange={(e) => patch({ companyName: e.target.value })}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-800">NIP</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.nip}
                onChange={(e) => patch({ nip: e.target.value })}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2"
              />
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
        className="rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? 'Zapisywanie…' : 'Zapisz dane'}
      </button>

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
