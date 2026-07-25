'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  formatSchoolDateShort,
  formatSchoolTime,
} from '@/lib/school-timezone';

type DashboardData = {
  counters: {
    pendingEnrollments: number;
    renewalsNoResponse: number;
    negotiatingEnrollments: number;
    resignations: number;
  };
  lessonsToday: LessonRow[];
  lessonsThisWeek: LessonRow[];
  billing: {
    unsettledCount: number;
    unpaidCount: number;
    periodMonth: string;
    items: Array<{
      childId: string;
      childName: string;
      parentEmail: string;
      status: string | null;
      amount: string | null;
    }>;
  };
};

type LessonRow = {
  id: string;
  scheduledAt: string;
  durationMin: number;
  status: string;
  groupName: string;
  locationName: string;
  teacherName: string;
  fromSchedule?: boolean;
};

type GroupRosterRow = {
  groupId: string;
  groupName: string;
  level: string | null;
  locationName: string;
  teacherName: string;
  children: Array<{ childId: string; childName: string }>;
};

function formatDt(value: string): string {
  return formatSchoolDateShort(value);
}

function formatTime(value: string): string {
  return formatSchoolTime(value);
}

function LessonListItem({
  lesson,
  showDate,
}: {
  lesson: LessonRow;
  showDate?: boolean;
}) {
  return (
    <li className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-zinc-900">{lesson.groupName}</p>
        <span className="text-xs font-medium text-zinc-500">
          {showDate ? formatDt(lesson.scheduledAt) : formatTime(lesson.scheduledAt)}
          {lesson.durationMin ? ` · ${lesson.durationMin} min` : ''}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-600">
        <span className="font-medium text-zinc-700">Lektor:</span> {lesson.teacherName || '—'}
      </p>
      <p className="text-sm text-zinc-600">
        <span className="font-medium text-zinc-700">Miejsce:</span> {lesson.locationName || '—'}
        {lesson.fromSchedule ? (
          <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
            harmonogram
          </span>
        ) : null}
      </p>
    </li>
  );
}

function CounterCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'sky' | 'rose';
}) {
  const tones = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    sky: 'border-sky-200 bg-sky-50 text-sky-900',
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-1 text-sm font-medium opacity-90">{label}</p>
    </div>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="rounded-2xl border border-emerald-100 bg-white p-4 sm:p-5">
      <header className="mb-4">
        <h3 className="text-lg font-bold text-[#0f6e56]">{title}</h3>
        {description && <p className="mt-1 text-sm text-zinc-600">{description}</p>}
      </header>
      {children}
    </section>
  );
}

export default function ManagerDashboardPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  const [groupRoster, setGroupRoster] = useState<GroupRosterRow[]>([]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/dashboard', {
        cache: 'no-store',
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message ?? 'Błąd pobierania pulpitu');
      setDashboard(data as DashboardData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania pulpitu');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGroupRoster = useCallback(async () => {
    const r = await fetch('/api/admin/groups/roster', { cache: 'no-store' });
    const data = await r.json();
    if (r.ok) setGroupRoster(data.groups ?? []);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    void loadGroupRoster();
  }, [loadGroupRoster]);

  if (loading && !dashboard) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-emerald-100/80" />
        ))}
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        {error}
        <button
          type="button"
          onClick={() => void loadDashboard()}
          className="ml-3 font-semibold underline"
        >
          Spróbuj ponownie
        </button>
      </div>
    );
  }

  if (!dashboard) return null;

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-emerald-100 bg-white p-4 sm:p-5">
        <h2 className="text-xl font-bold text-[#0f6e56] sm:text-2xl">Pulpit operacyjny</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Szybki podgląd zgłoszeń, zajęć i płatności.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CounterCard
          label="Oczekujące zgłoszenia"
          value={dashboard.counters.pendingEnrollments}
          tone="emerald"
        />
        <CounterCard
          label="Odnowienia bez odpowiedzi"
          value={dashboard.counters.renewalsNoResponse}
          tone="sky"
        />
        <CounterCard
          label="Negocjacje terminów"
          value={dashboard.counters.negotiatingEnrollments}
          tone="amber"
        />
        <CounterCard
          label="Rezygnacje"
          value={dashboard.counters.resignations}
          tone="rose"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section title="Zajęcia dziś" description={`${dashboard.lessonsToday.length} lekcji`}>
          {dashboard.lessonsToday.length === 0 ? (
            <p className="text-sm text-zinc-500">Brak zajęć na dziś.</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
              {dashboard.lessonsToday.map((l) => (
                <LessonListItem key={l.id} lesson={l} />
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Zajęcia w tym tygodniu"
          description={`${dashboard.lessonsThisWeek.length} lekcji (łącznie z dziś)`}
        >
          {dashboard.lessonsThisWeek.length === 0 ? (
            <p className="text-sm text-zinc-500">Brak zajęć w tym tygodniu.</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
              {dashboard.lessonsThisWeek.map((l) => (
                <LessonListItem key={l.id} lesson={l} showDate />
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section
        title="Płatności — bieżący miesiąc"
        description={`Okres ${dashboard.billing.periodMonth}: ${dashboard.billing.unsettledCount} nierozliczonych, ${dashboard.billing.unpaidCount} niezapłaconych`}
      >
        {dashboard.billing.items.length === 0 ? (
          <p className="text-sm text-zinc-500">Brak pozycji wymagających uwagi.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-zinc-700">
                <tr>
                  <th className="px-3 py-2 font-semibold">Uczeń</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Kwota</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.billing.items.map((item) => (
                  <tr key={item.childId} className="border-t border-zinc-100">
                    <td className="px-3 py-2">{item.childName}</td>
                    <td className="px-3 py-2">{item.status ?? 'Brak rozliczenia'}</td>
                    <td className="px-3 py-2">{item.amount ? `${item.amount} zł` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Grupy i dzieci"
        description="Aktywne grupy w bieżącym roku szkolnym"
      >
        {groupRoster.length === 0 ? (
          <p className="text-sm text-zinc-500">Brak aktywnych grup.</p>
        ) : (
          <div className="space-y-3">
            {groupRoster.map((group) => (
              <div
                key={group.groupId}
                className="rounded-xl border border-emerald-100 bg-emerald-50/30 px-3 py-3 sm:px-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-zinc-900">{group.groupName}</p>
                  <p className="text-xs font-medium text-zinc-500">
                    {group.children.length}{' '}
                    {group.children.length === 1
                      ? 'dziecko'
                      : group.children.length >= 2 && group.children.length <= 4
                        ? 'dzieci'
                        : 'dzieci'}
                  </p>
                </div>
                <p className="mt-1 text-sm text-zinc-600">
                  {group.level ? `${group.level} · ` : ''}
                  {group.locationName}
                  {group.teacherName !== '—' ? ` · ${group.teacherName}` : ''}
                </p>
                {group.children.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-500">Brak dzieci w grupie.</p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {group.children.map((child) => (
                      <li
                        key={child.childId}
                        className="rounded-lg border border-emerald-100 bg-white px-2.5 py-1 text-sm text-zinc-800"
                      >
                        {child.childName}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
