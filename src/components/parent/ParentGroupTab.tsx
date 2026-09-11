'use client';

import { useCallback, useEffect, useState } from 'react';
import { ENROLLMENT_REQUIRE_PROPOSAL_ACCEPTANCE } from '@/lib/enrollment-status';
import { paymentTypeShortLabel } from '@/lib/payment-labels';
import { formatLessonDateTime } from '@/src/components/parent/parent-portal-utils';

const COLLAPSED_LESSON_COUNT = 3;

type UpcomingLesson = {
  id: string;
  scheduledAt: string;
  durationMin: number;
  status: string;
  locationName: string | null;
  groupId?: string;
  groupName?: string | null;
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
  scheduleChangeNotice?: boolean;
  scheduleBeforeLabel?: string | null;
  scheduleCurrentLabel?: string | null;
  groupChangeNotice?: boolean;
  groupBeforeLabel?: string | null;
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
      return ENROLLMENT_REQUIRE_PROPOSAL_ACCEPTANCE
        ? 'Grupa przypisana — uzupełnij dane do umowy'
        : 'Grupa przypisana — oczekuje na podpisanie umowy przez rodzica';
    case 'AWAITING_CONTRACT':
      return 'Oczekuje na wygenerowanie umowy przez szkołę';
    case 'CONTRACT_READY':
      return 'Umowa gotowa do podpisu';
    default:
      return 'Propozycja grupy w trakcie zapisu';
  }
}

/** Zajęcia uznajemy za odbyte, gdy minęła data i godzina rozpoczęcia (albo status COMPLETED). */
function isLessonPast(lesson: UpcomingLesson, nowMs: number): boolean {
  if (String(lesson.status).toUpperCase() === 'COMPLETED') return true;
  const start = new Date(lesson.scheduledAt).getTime();
  return Number.isFinite(start) && start <= nowMs;
}

function groupLessonsKey(g: Pick<GroupInfo, 'childId' | 'groupId'>): string {
  return `${g.childId}:${g.groupId}`;
}

/** Zwinięta lista: najbliższe nadchodzące (albo ostatnie odbyte, gdy wszystkie minęły). */
function collapsedLessonsSlice(
  lessons: UpcomingLesson[],
  nowMs: number,
): UpcomingLesson[] {
  if (lessons.length <= COLLAPSED_LESSON_COUNT) return lessons;
  const firstFuture = lessons.findIndex((l) => !isLessonPast(l, nowMs));
  if (firstFuture < 0) {
    return lessons.slice(-COLLAPSED_LESSON_COUNT);
  }
  return lessons.slice(firstFuture, firstFuture + COLLAPSED_LESSON_COUNT);
}

export default function ParentGroupTab() {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [proposedGroups, setProposedGroups] = useState<ProposedGroupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedLessons, setExpandedLessons] = useState<Record<string, boolean>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());

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

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

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
        <p className="mt-1 text-sm text-zinc-600">Aktualna grupa, harmonogram i zajęcia.</p>
      </header>

      <div className="space-y-4">
        {groups.map((g) => {
          const key = groupLessonsKey(g);
          const expanded = expandedLessons[key] === true;
          const lessons = g.upcomingLessons;
          const visibleLessons = expanded
            ? lessons
            : collapsedLessonsSlice(lessons, nowMs);
          const canToggle = lessons.length > COLLAPSED_LESSON_COUNT;
          const pastCount = lessons.filter((l) => isLessonPast(l, nowMs)).length;

          return (
            <article
              key={key}
              className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 md:p-5"
            >
              <p className="text-base font-semibold text-zinc-900">
                {g.childFirstName} {g.childLastName}
              </p>

              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-[max-content_1fr]">
                <span className="font-semibold text-zinc-800">Grupa:</span>
                <div className="space-y-2">
                  <span className="block">{g.groupName}</span>
                  {g.groupChangeNotice &&
                  g.groupBeforeLabel &&
                  g.groupName &&
                  g.groupBeforeLabel.trim() !== g.groupName.trim() ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                      <p className="font-semibold">Zmiana grupy</p>
                      <p className="mt-1">
                        Grupa zmieniła się z{' '}
                        <span className="text-amber-900/80">{g.groupBeforeLabel}</span>
                        {' '}na{' '}
                        <span className="font-bold text-amber-950">{g.groupName}</span>.
                      </p>
                    </div>
                  ) : null}
                </div>
                <span className="font-semibold text-zinc-800">Poziom:</span>
                <span>{g.level ?? '—'}</span>
                <span className="font-semibold text-zinc-800">Harmonogram:</span>
                <div className="space-y-2">
                  <span className="block">{g.schedule}</span>
                  {g.scheduleChangeNotice &&
                  g.scheduleBeforeLabel &&
                  (g.scheduleCurrentLabel || g.schedule) ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                      <p className="font-semibold">Zmiana terminu zajęć</p>
                      <p className="mt-1">
                        Termin zajęć zmienił się z{' '}
                        <span className="text-amber-900/80">{g.scheduleBeforeLabel}</span>
                        {' '}na{' '}
                        <span className="font-bold text-amber-950">
                          {g.scheduleCurrentLabel?.trim() || g.schedule}
                        </span>
                        .
                      </p>
                    </div>
                  ) : null}
                </div>
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
                <h3 className="text-sm font-semibold text-zinc-900">
                  Zajęcia ({lessons.length})
                </h3>
                {lessons.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-600">Brak zaplanowanych terminów.</p>
                ) : (
                  <div className="mt-2">
                    <ul
                      className={
                        expanded
                          ? 'max-h-64 space-y-2 overflow-y-auto pr-1'
                          : 'space-y-2'
                      }
                    >
                      {visibleLessons.map((lesson) => {
                        const past = isLessonPast(lesson, nowMs);
                        return (
                          <li
                            key={lesson.id}
                            className={
                              past
                                ? 'flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-100/80 px-3 py-2 text-sm text-zinc-500'
                                : 'rounded-xl border border-white bg-white px-3 py-2 text-sm text-zinc-800'
                            }
                          >
                            <span className={past ? 'font-medium line-through decoration-zinc-400' : 'font-medium'}>
                              {formatLessonDateTime(lesson.scheduledAt)}
                            </span>
                            {lesson.locationName ? (
                              <span className={past ? 'text-zinc-400' : 'text-zinc-600'}>
                                {' '}
                                · {lesson.locationName}
                              </span>
                            ) : null}
                            <span className={past ? 'text-zinc-400' : 'text-zinc-500'}>
                              {' '}
                              · {lesson.durationMin} min
                            </span>
                            {past ? (
                              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                                Odbyte
                              </span>
                            ) : null}
                            {past &&
                            lesson.groupName &&
                            lesson.groupId &&
                            lesson.groupId !== g.groupId ? (
                              <span className={past ? 'text-zinc-400' : 'text-zinc-500'}>
                                · grupa: {lesson.groupName}
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                    {canToggle ? (
                      <button
                        type="button"
                        className="mt-2 text-sm font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-950"
                        onClick={() =>
                          setExpandedLessons((prev) => ({
                            ...prev,
                            [key]: !expanded,
                          }))
                        }
                      >
                        {expanded
                          ? 'Zwiń listę'
                          : `Pokaż wszystkie zajęcia (${lessons.length}${
                              pastCount > 0 ? `, w tym ${pastCount} odbyte` : ''
                            })`}
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
