'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatEnrollmentStatusLabel } from '@/lib/enrollment-status';
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

type ProfileChild = {
  childId?: string;
  firstName: string;
  lastName: string;
  birthDate?: string;
  active?: boolean;
  accessLevel?: string | null;
  resignationRequested?: boolean;
};

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

function childActivityLabel(child: ProfileChild): { label: string; className: string } {
  if (child.resignationRequested) {
    return { label: 'Rezygnacja zgłoszona', className: 'bg-amber-100 text-amber-900' };
  }
  if (child.active === false) {
    return { label: 'Nieaktywne', className: 'bg-zinc-200 text-zinc-700' };
  }
  const level = String(child.accessLevel ?? '')
    .trim()
    .toUpperCase();
  if (level === 'SIGNED' || level === 'COMPLETED') {
    return { label: 'Aktywne', className: 'bg-emerald-100 text-emerald-800' };
  }
  if (level === 'REJECTED') {
    return { label: 'Odrzucone', className: 'bg-rose-100 text-rose-800' };
  }
  if (level) {
    return {
      label: formatEnrollmentStatusLabel(level),
      className: 'bg-sky-100 text-sky-800',
    };
  }
  return child.active === true
    ? { label: 'Aktywne', className: 'bg-emerald-100 text-emerald-800' }
    : { label: 'Nieaktywne', className: 'bg-zinc-200 text-zinc-700' };
}

export default function ParentProfileSection({
  complimentaryAccess = false,
  children: profileChildren = [],
}: {
  complimentaryAccess?: boolean;
  children?: ProfileChild[];
}) {
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [hasProfile, setHasProfile] = useState(false);
  const [clientNumber, setClientNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  /** Sposób rozliczenia edytowalny tylko przy generowaniu umowy (Proces zapisu). */
  const billingTypeLocked = hasProfile;

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
      <div className="space-y-4">
        <section className="rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
          <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Profil</h2>
          <p className="mt-2 text-sm text-zinc-600">Ładowanie…</p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
        <header>
          <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Zgłoszone dzieci</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Status aktywności dzieci powiązanych z Twoim kontem.
          </p>
        </header>

        {profileChildren.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
            Brak zgłoszonych dzieci.
          </div>
        ) : (
          <ul className="space-y-2">
            {profileChildren.map((child, index) => {
              const status = childActivityLabel(child);
              const key = child.childId ?? `${child.firstName}-${child.lastName}-${index}`;
              return (
                <li
                  key={key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-zinc-900">
                      {child.firstName} {child.lastName}
                    </p>
                    {child.birthDate ? (
                      <p className="text-xs text-zinc-500">
                        Ur. {String(child.birthDate).slice(0, 10)}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}
                  >
                    {status.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!complimentaryAccess ? (
        <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
          <header>
            <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Dane do faktury</h2>
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
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 [color-scheme:light] placeholder:text-zinc-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-800">Nazwisko</label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => patch({ lastName: e.target.value })}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 [color-scheme:light] placeholder:text-zinc-400"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-zinc-800">Telefon</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => patch({ phone: e.target.value })}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 [color-scheme:light] placeholder:text-zinc-400"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <p className="text-sm font-medium text-zinc-800">Rozliczenie</p>
              <div
                className={`flex flex-wrap gap-4 rounded-xl border px-3 py-3 ${
                  billingTypeLocked
                    ? 'border-zinc-200 bg-zinc-100/80'
                    : 'border-transparent bg-transparent p-0'
                }`}
              >
                <label
                  className={`inline-flex items-center gap-2 text-sm ${
                    billingTypeLocked ? 'cursor-default text-zinc-500' : 'text-zinc-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="billingType"
                    checked={form.billingType === 'private'}
                    disabled={billingTypeLocked}
                    onChange={() => patch({ billingType: 'private' })}
                    className="accent-[#0f6e56] disabled:opacity-60"
                  />
                  Osoba prywatna (PESEL)
                </label>
                <label
                  className={`inline-flex items-center gap-2 text-sm ${
                    billingTypeLocked ? 'cursor-default text-zinc-500' : 'text-zinc-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="billingType"
                    checked={form.billingType === 'company'}
                    disabled={billingTypeLocked}
                    onChange={() => patch({ billingType: 'company' })}
                    className="accent-[#0f6e56] disabled:opacity-60"
                  />
                  Firma (faktura)
                </label>
              </div>
              {billingTypeLocked ? (
                <p className="text-xs text-zinc-500">
                  Sposób rozliczenia (osoba prywatna / firma) można zmienić tylko przy generowaniu
                  kolejnej umowy w zakładce Proces zapisu.
                </p>
              ) : null}
            </div>
            {form.billingType === 'private' ? (
              <>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium text-zinc-800">PESEL</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={11}
                    value={form.pesel}
                    onChange={(e) => patch({ pesel: e.target.value })}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 [color-scheme:light] placeholder:text-zinc-400"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium text-zinc-800">Adres</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => patch({ address: e.target.value })}
                    placeholder="ul. Przykładowa 1"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 [color-scheme:light] placeholder:text-zinc-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-800">Miasto</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => patch({ city: e.target.value })}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 [color-scheme:light] placeholder:text-zinc-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-800">Kod pocztowy</label>
                  <input
                    type="text"
                    value={form.zipCode}
                    onChange={(e) => patch({ zipCode: e.target.value })}
                    placeholder="00-000"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 [color-scheme:light] placeholder:text-zinc-400"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium text-zinc-800">Nazwa firmy</label>
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={(e) => patch({ companyName: e.target.value })}
                    placeholder="Pełna nazwa firmy"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 [color-scheme:light] placeholder:text-zinc-400"
                  />
                </div>
                <div className="space-y-1 md:col-span-2 max-w-sm">
                  <label className="text-sm font-medium text-zinc-800">NIP</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={10}
                    value={form.nip}
                    onChange={(e) => patch({ nip: e.target.value })}
                    placeholder="10 cyfr"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 [color-scheme:light] placeholder:text-zinc-400"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium text-zinc-800">Adres siedziby firmy</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => patch({ address: e.target.value })}
                    placeholder="ul. Przykładowa 1"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 [color-scheme:light] placeholder:text-zinc-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-800">Miasto</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => patch({ city: e.target.value })}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 [color-scheme:light] placeholder:text-zinc-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-800">Kod pocztowy</label>
                  <input
                    type="text"
                    value={form.zipCode}
                    onChange={(e) => patch({ zipCode: e.target.value })}
                    placeholder="00-000"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 [color-scheme:light] placeholder:text-zinc-400"
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
      ) : null}
    </div>
  );
}
