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

type ProposedGroupInfo = {
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
  accessLevel: string;
};

function proposedStatusLabel(accessLevel: string): string {
  switch (accessLevel) {
    case 'PROPOSED':
      return 'Propozycja grupy — czekamy na Twoją decyzję';
    case 'NEGOTIATING':
      return 'Negocjacja terminu — szkoła przygotuje nową propozycję';
    case 'ACCEPTED':
      return 'Grupa przypisana — uzupełnij dane do umowy';
    case 'AWAITING_CONTRACT':
      return 'Oczekuje na wygenerowanie umowy przez szkołę';
    case 'CONTRACT_READY':
      return 'Umowa gotowa do podpisu';
    default:
      return 'Propozycja grupy w trakcie zapisu';
  }
}

export default function ParentGroupTab() {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [proposedGroups, setProposedGroups] = useState<ProposedGroupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/parent/groups', { cache: 'no-store', credentials: 'include' });
      const data = (await r.json().catch(() => ({}))) as {
        groups?: GroupInfo[];
        proposedGroups?: ProposedGroupInfo[];
        message?: string;
      };
      if (!r.ok) {
        setError(data.message ?? 'Nie udało się pobrać danych grupy');
        setGroups([]);
        setProposedGroups([]);
        return;
      }
      setGroups(data.groups ?? []);
      setProposedGroups(data.proposedGroups ?? []);
    } catch {
      setError('Błąd połączenia z serwerem');
      setGroups([]);
      setProposedGroups([]);
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

  if (groups.length === 0 && proposedGroups.length > 0) {
    return (
      <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
        <header>
          <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Moja grupa</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Propozycja grupy z procesu zapisu. Pełne informacje o zajęciach pojawią się po
            zakończeniu zapisu.
          </p>
        </header>

        <div className="space-y-4">
          {proposedGroups.map((g) => (
            <article
              key={`${g.childId}-${g.groupId}`}
              className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4 md:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-base font-semibold text-zinc-900">
                  {g.childFirstName} {g.childLastName}
                </p>
                <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-900">
                  Propozycja
                </span>
              </div>
              <p className="mt-2 text-sm text-sky-900">{proposedStatusLabel(g.accessLevel)}</p>

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
              </div>
            </article>
          ))}
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
