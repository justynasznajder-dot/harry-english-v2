'use client';

import { useCallback, useEffect, useState } from 'react';
import { paymentTypeShortLabel } from '@/lib/payment-labels';
import { formatLessonDateTime } from '@/src/components/parent/parent-portal-utils';

type UpcomingLesson = {
  id: string;
  scheduledAt: string;
  durationMin: number;
  status: string;
  locationName: string | null;
};

type GroupInfo = {
  childId: string;
  childFirstName: string;
  childLastName: string;
  groupId: string;
  groupName: string;
  level: string | null;
  schedule: string;
  locationName: string;
  locationAddress: string | null;
  teacherName: string;
  paymentType: string | null;
  upcomingLessons: UpcomingLesson[];
};

export default function ParentGroupTab() {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/parent/groups', { cache: 'no-store', credentials: 'include' });
      const data = (await r.json().catch(() => ({}))) as {
        groups?: GroupInfo[];
        message?: string;
      };
      if (!r.ok) {
        setError(data.message ?? 'Nie udało się pobrać danych grupy');
        setGroups([]);
        return;
      }
      setGroups(data.groups ?? []);
    } catch {
      setError('Błąd połączenia z serwerem');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
        <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Moja grupa</h2>
        <p className="text-sm text-zinc-600">Ładowanie…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
        <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Moja grupa</h2>
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      </section>
    );
  }

  if (groups.length === 0) {
    return (
      <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
        <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Moja grupa</h2>
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600">
          Nie przypisano jeszcze do grupy. Po zakończeniu procesu zapisu informacje pojawią się tutaj.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
      <header>
        <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Moja grupa</h2>
        <p className="mt-1 text-sm text-zinc-600">Aktualna grupa, harmonogram i nadchodzące zajęcia.</p>
      </header>

      <div className="space-y-4">
        {groups.map((g) => (
          <article
            key={`${g.childId}-${g.groupId}`}
            className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 md:p-5"
          >
            <p className="text-base font-semibold text-zinc-900">
              {g.childFirstName} {g.childLastName}
            </p>

            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-[max-content_1fr]">
              <span className="font-semibold text-zinc-800">Grupa:</span>
              <span>{g.groupName}</span>
              <span className="font-semibold text-zinc-800">Poziom:</span>
              <span>{g.level ?? '—'}</span>
              <span className="font-semibold text-zinc-800">Harmonogram:</span>
              <span>{g.schedule}</span>
              <span className="font-semibold text-zinc-800">Lokalizacja:</span>
              <span>
                {g.locationName}
                {g.locationAddress ? (
                  <span className="block text-zinc-600">{g.locationAddress}</span>
                ) : null}
              </span>
              <span className="font-semibold text-zinc-800">Lektor:</span>
              <span>{g.teacherName}</span>
              {g.paymentType ? (
                <>
                  <span className="font-semibold text-zinc-800">Rozliczenie:</span>
                  <span>{paymentTypeShortLabel(g.paymentType)}</span>
                </>
              ) : null}
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-zinc-900">Następne zajęcia</h3>
              {g.upcomingLessons.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-600">Brak zaplanowanych terminów.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {g.upcomingLessons.map((lesson) => (
                    <li
                      key={lesson.id}
                      className="rounded-xl border border-white bg-white px-3 py-2 text-sm text-zinc-800"
                    >
                      <span className="font-medium">{formatLessonDateTime(lesson.scheduledAt)}</span>
                      {lesson.locationName ? (
                        <span className="text-zinc-600"> · {lesson.locationName}</span>
                      ) : null}
                      <span className="text-zinc-500"> · {lesson.durationMin} min</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
