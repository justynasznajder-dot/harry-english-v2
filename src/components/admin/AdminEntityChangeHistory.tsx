'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatSchoolDateTime } from '@/lib/school-timezone';

type ChangeActor = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  role: string | null;
};

type ChangeRow = {
  id: string;
  action: string;
  summary: string;
  payload: {
    fields?: string[];
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  } | null;
  createdAt: string;
  actor: ChangeActor | null;
};

const FIELD_LABELS: Record<string, string> = {
  first_name: 'Imię',
  last_name: 'Nazwisko',
  email: 'Email',
  phone: 'Telefon',
  confirmed: 'Potwierdzony',
  active: 'Aktywny',
  address: 'Adres',
  city: 'Miasto',
  zip_code: 'Kod pocztowy',
  company_name: 'Firma',
  nip: 'NIP',
  billing_type: 'Typ rozliczenia',
  birth_date: 'Data urodzenia',
  lesson_unit_price: 'Stawka za zajęcia',
  monthly_unit_price: 'Stawka ratalna',
  yearly_unit_price: 'Stawka jednorazowa',
  discount_percent: '% zniżki',
};

const ACTION_LABELS: Record<string, string> = {
  ACCOUNT_UPDATE: 'Zmiana konta',
  PROFILE_UPDATE: 'Zmiana profilu / faktury',
  DEACTIVATE: 'Dezaktywacja',
  RESTORE: 'Aktywacja',
  PRICES_UPDATE: 'Zmiana stawek',
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'tak' : 'nie';
  if (value === 'company') return 'firma';
  if (value === 'private') return 'osoba prywatna';
  return String(value);
}

function actorLabel(actor: ChangeActor | null): string {
  if (!actor) return 'nieznany użytkownik';
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim();
  if (name) return name;
  return actor.email?.trim() || 'nieznany użytkownik';
}

type Props = {
  entityType: 'parent' | 'child';
  entityId: string;
  /** Odśwież po zapisie w formularzu. */
  refreshKey?: number | string;
};

export default function AdminEntityChangeHistory({
  entityType,
  entityId,
  refreshKey = 0,
}: Props) {
  const [rows, setRows] = useState<ChangeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        entityType,
        entityId,
        limit: '40',
      });
      const res = await fetch(`/api/admin/change-logs?${q}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Nie udało się wczytać historii');
      setRows(Array.isArray(data.rows) ? (data.rows as ChangeRow[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd historii zmian');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold text-[#1e3a4c]">Historia zmian</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Kto i kiedy zmieniał dane tego konta (po wdrożeniu logowania).
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-zinc-500">Wczytywanie…</p>
      ) : error ? (
        <p className="mt-4 text-sm text-rose-600">{error}</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">Brak zapisanych zmian.</p>
      ) : (
        <ul className="mt-4 divide-y divide-emerald-50">
          {rows.map((row) => {
            const fields = row.payload?.fields ?? [];
            const before = row.payload?.before ?? {};
            const after = row.payload?.after ?? {};
            return (
              <li key={row.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-900">
                    {ACTION_LABELS[row.action] ?? row.summary}
                  </p>
                  <time className="text-xs tabular-nums text-zinc-500">
                    {formatSchoolDateTime(row.createdAt)}
                  </time>
                </div>
                <p className="mt-0.5 text-xs text-zinc-600">
                  {actorLabel(row.actor)}
                  {row.actor?.role ? ` · ${row.actor.role}` : null}
                </p>
                {fields.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-zinc-700">
                    {fields.map((field) => (
                      <li key={field} className="flex flex-wrap gap-x-1">
                        <span className="font-medium text-zinc-800">
                          {FIELD_LABELS[field] ?? field}:
                        </span>
                        <span className="text-zinc-500">{formatValue(before[field])}</span>
                        <span className="text-zinc-400">→</span>
                        <span>{formatValue(after[field])}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-zinc-500">{row.summary}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
