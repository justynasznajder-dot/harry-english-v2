'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UserInfo } from '@/src/components/enrollment/EnrollmentParentFlow';
import {
  attendanceStatusClass,
  attendanceStatusLabel,
  formatLessonDateTime,
  formatMonthLabel,
} from '@/src/components/parent/parent-portal-utils';

type AttendanceRecord = {
  childId: string;
  childName: string;
  lessonId: string;
  scheduledAt: string;
  status: string | null;
  note: string | null;
  groupName: string;
  locationName: string | null;
  lessonStatus: string;
};

type MonthlySummary = {
  month: string;
  childId: string;
  childName: string;
  presentCount: number;
  totalCount: number;
  percentage: number;
};

export default function ParentAttendanceTab({ userInfo }: { userInfo: UserInfo }) {
  const children = userInfo.children ?? [];
  const [selectedChildId, setSelectedChildId] = useState<string>('all');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs =
        selectedChildId !== 'all'
          ? `?childId=${encodeURIComponent(selectedChildId)}`
          : '';
      const r = await fetch(`/api/parent/attendance${qs}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const data = (await r.json().catch(() => ({}))) as {
        records?: AttendanceRecord[];
        monthlySummary?: MonthlySummary[];
        message?: string;
      };
      if (!r.ok) {
        setError(data.message ?? 'Nie udało się pobrać obecności');
        setRecords([]);
        setMonthlySummary([]);
        return;
      }
      setRecords(data.records ?? []);
      setMonthlySummary(data.monthlySummary ?? []);
    } catch {
      setError('Błąd połączenia z serwerem');
      setRecords([]);
      setMonthlySummary([]);
    } finally {
      setLoading(false);
    }
  }, [selectedChildId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRecords = useMemo(() => {
    return records.filter((r) => {
      if (r.lessonStatus === 'CANCELLED') return true;
      if (r.lessonStatus === 'SCHEDULED' && !r.status) return false;
      return true;
    });
  }, [records]);

  return (
    <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Obecności</h2>
          <p className="mt-1 text-sm text-zinc-600">Historia obecności i podsumowanie miesięczne.</p>
        </div>
        {children.length > 1 ? (
          <select
            value={selectedChildId}
            onChange={(e) => setSelectedChildId(e.target.value)}
            className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          >
            <option value="all">Wszystkie dzieci</option>
            {children.map((c) => (
              <option key={c.childId ?? c.firstName} value={c.childId ?? ''}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
        ) : null}
      </header>

      {loading ? (
        <p className="text-sm text-zinc-600">Ładowanie…</p>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : (
        <>
          {monthlySummary.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {monthlySummary.slice(0, 6).map((s) => (
                <div
                  key={`${s.childId}-${s.month}`}
                  className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                    {formatMonthLabel(s.month)}
                  </p>
                  <p className="mt-1 text-sm text-zinc-700">{s.childName}</p>
                  <p className="mt-2 text-2xl font-bold text-zinc-900">{s.percentage}%</p>
                  <p className="text-xs text-zinc-600">
                    {s.presentCount} / {s.totalCount} zajęć
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-zinc-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-zinc-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">Data</th>
                  {children.length > 1 && selectedChildId === 'all' ? (
                    <th className="px-4 py-3 font-semibold">Dziecko</th>
                  ) : null}
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Notatka</th>
                </tr>
              </thead>
              <tbody>
                {visibleRecords.length === 0 ? (
                  <tr>
                    <td
                      colSpan={children.length > 1 && selectedChildId === 'all' ? 4 : 3}
                      className="px-4 py-8 text-center text-zinc-600"
                    >
                      Brak danych o obecnościach.
                    </td>
                  </tr>
                ) : (
                  visibleRecords.map((r) => {
                    const displayStatus =
                      r.lessonStatus === 'CANCELLED'
                        ? 'ANULOWANA'
                        : (r.status ?? 'PRESENT');
                    return (
                      <tr key={`${r.lessonId}-${r.childId}`} className="border-t border-zinc-100">
                        <td className="px-4 py-3">
                          <div>{formatLessonDateTime(r.scheduledAt)}</div>
                          <div className="text-xs text-zinc-500">{r.groupName}</div>
                        </td>
                        {children.length > 1 && selectedChildId === 'all' ? (
                          <td className="px-4 py-3">{r.childName}</td>
                        ) : null}
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${attendanceStatusClass(displayStatus)}`}
                          >
                            {r.lessonStatus === 'CANCELLED'
                              ? 'Lekcja anulowana'
                              : attendanceStatusLabel(displayStatus)}
                          </span>
                        </td>
                        <td className="hidden px-4 py-3 text-zinc-600 md:table-cell">
                          {r.note?.trim() || '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
