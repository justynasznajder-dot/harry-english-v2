'use client';

import { useEffect, useState } from 'react';
import {
  DUPLICATE_CHILD_IN_FORM_MESSAGE,
  findDuplicateChildIndices,
} from '@/lib/enrollment-duplicate';
import { todayYmdSchool } from '@/lib/school-timezone';

type ChildForm = {
  firstName: string;
  lastName: string;
  birthDate: string;
  preferredLocationId: string;
};

type LocationOption = {
  id: string;
  name: string;
  is_featured?: boolean;
  is_new?: boolean;
  label?: string;
};

type Props = {
  onSuccess: () => void | Promise<void>;
};

const emptyChild = (): ChildForm => ({
  firstName: '',
  lastName: '',
  birthDate: '',
  preferredLocationId: '',
});

export default function ParentAddChildSection({ onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<ChildForm[]>([emptyChild()]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; message: string } | null>(
    null
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLocationsLoading(true);
    fetch('/api/public/locations')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { locations?: LocationOption[] }) => {
        if (!cancelled) setLocations(Array.isArray(data.locations) ? data.locations : []);
      })
      .catch(() => {
        if (!cancelled) setLocations([]);
      })
      .finally(() => {
        if (!cancelled) setLocationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function updateChild(index: number, field: keyof ChildForm, value: string) {
    setChildren((prev) =>
      prev.map((child, i) => (i === index ? { ...child, [field]: value } : child))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFlash(null);
    const newErrors: Record<string, string> = {};
    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    children.forEach((child, index) => {
      if (!child.firstName.trim()) newErrors[`c_${index}_firstName`] = 'Pole wymagane';
      if (!child.lastName.trim()) newErrors[`c_${index}_lastName`] = 'Pole wymagane';
      const bd = child.birthDate.trim();
      if (!bd || !isoDate.test(bd)) {
        newErrors[`c_${index}_birthDate`] = 'Wybierz datę urodzenia';
      } else {
        const [y, m, d] = bd.split('-').map(Number);
        const parsed = new Date(y, m - 1, d);
        if (
          parsed.getFullYear() !== y ||
          parsed.getMonth() !== m - 1 ||
          parsed.getDate() !== d
        ) {
          newErrors[`c_${index}_birthDate`] = 'Nieprawidłowa data';
        } else if (y < 2000) {
          newErrors[`c_${index}_birthDate`] = 'Rok nie może być wcześniejszy niż 2000';
        } else if (parsed > todayEnd) {
          newErrors[`c_${index}_birthDate`] = 'Data nie może być w przyszłości';
        }
      }
      if (locations.length > 0 && !child.preferredLocationId.trim()) {
        newErrors[`c_${index}_location`] = 'Wybierz lokalizację';
      }
    });

    findDuplicateChildIndices(children).forEach((index) => {
      newErrors[`c_${index}_firstName`] = DUPLICATE_CHILD_IN_FORM_MESSAGE;
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setBusy(true);
    try {
      const r = await fetch('/api/parent/enrollment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          children: children.map((c) => ({
            firstName: c.firstName.trim(),
            lastName: c.lastName.trim(),
            birthDate: c.birthDate.trim(),
            preferredLocationId: c.preferredLocationId.trim() || undefined,
          })),
        }),
      });
      const data = (await r.json().catch(() => ({}))) as { message?: string };
      if (!r.ok) {
        setFlash({ kind: 'error', message: data.message ?? 'Nie udało się zapisać zgłoszenia' });
        return;
      }
      setFlash({
        kind: 'success',
        message: data.message ?? 'Zgłoszenie zostało zapisane.',
      });
      setChildren([emptyChild()]);
      setOpen(false);
      await onSuccess();
    } catch {
      setFlash({ kind: 'error', message: 'Błąd połączenia z serwerem' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Dodaj kolejne dziecko</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Zgłoszenie trafi na Twoje konto — bez ponownego podawania danych rodzica.
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => {
              setFlash(null);
              setOpen(true);
            }}
            className="rounded-full border border-[#0f6e56] bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0c5a46]"
          >
            + Dodaj dziecko
          </button>
        )}
      </header>

      {flash && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            flash.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {flash.message}
        </div>
      )}

      {open && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {children.map((child, index) => (
            <div key={index} className="space-y-3 rounded-2xl border border-zinc-200 p-4">
              {children.length > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-800">Dziecko {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => setChildren((prev) => prev.filter((_, i) => i !== index))}
                    className="text-sm font-medium text-red-600 hover:text-red-800"
                  >
                    Usuń
                  </button>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-zinc-700">Imię *</label>
                  <input
                    type="text"
                    value={child.firstName}
                    onChange={(e) => updateChild(index, 'firstName', e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-[#0f6e56] focus:ring-2 focus:ring-[#0f6e56]/20"
                    required
                  />
                  {errors[`c_${index}_firstName`] && (
                    <p className="mt-1 text-xs text-red-600">{errors[`c_${index}_firstName`]}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-zinc-700">Nazwisko *</label>
                  <input
                    type="text"
                    value={child.lastName}
                    onChange={(e) => updateChild(index, 'lastName', e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-[#0f6e56] focus:ring-2 focus:ring-[#0f6e56]/20"
                    required
                  />
                  {errors[`c_${index}_lastName`] && (
                    <p className="mt-1 text-xs text-red-600">{errors[`c_${index}_lastName`]}</p>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-zinc-700">
                  Data urodzenia *
                </label>
                <input
                  type="date"
                  value={child.birthDate}
                  min="2000-01-01"
                  max={todayYmdSchool()}
                  onChange={(e) => updateChild(index, 'birthDate', e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-[#0f6e56] focus:ring-2 focus:ring-[#0f6e56]/20"
                  required
                />
                {errors[`c_${index}_birthDate`] && (
                  <p className="mt-1 text-xs text-red-600">{errors[`c_${index}_birthDate`]}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-zinc-700">
                  Preferowana lokalizacja *
                </label>
                <select
                  value={child.preferredLocationId}
                  onChange={(e) => updateChild(index, 'preferredLocationId', e.target.value)}
                  disabled={locationsLoading || locations.length === 0}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-[#0f6e56] focus:ring-2 focus:ring-[#0f6e56]/20 disabled:bg-zinc-100"
                  required={locations.length > 0}
                >
                  <option value="">
                    {locationsLoading
                      ? 'Ładowanie lokalizacji…'
                      : locations.length === 0
                        ? 'Brak lokalizacji — skontaktuj się ze szkołą'
                        : '— Wybierz —'}
                  </option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.label ??
                        (loc.is_featured
                          ? `★ ${loc.name}${loc.is_new ? ' (Nowość!)' : ''}`
                          : `${loc.name}${loc.is_new ? ' (Nowość!)' : ''}`)}
                    </option>
                  ))}
                </select>
                {errors[`c_${index}_location`] && (
                  <p className="mt-1 text-xs text-red-600">{errors[`c_${index}_location`]}</p>
                )}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setChildren((prev) => [...prev, emptyChild()])}
            className="w-full rounded-lg border-2 border-dashed border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:border-[#0f6e56] hover:text-[#0f6e56]"
          >
            + Dodaj kolejne dziecko do tego zgłoszenia
          </button>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setErrors({});
                setChildren([emptyChild()]);
              }}
              className="w-full rounded-full border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-[#ffc94a] px-4 py-2.5 text-sm font-semibold text-[#3b2a10] hover:bg-[#ffd76f] disabled:opacity-50"
            >
              {busy ? 'Zapisywanie…' : 'Wyślij zgłoszenie'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
