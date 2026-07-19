'use client';

import { useCallback, useEffect, useState } from 'react';
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
  alerts: {
    resignations: ResignationAlert[];
    staleNegotiations: StaleAlert[];
    missingAttendance: AttendanceAlert[];
  };
  negotiatingDaysThreshold: number;
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

type ResignationAlert = {
  childId: string;
  childName: string;
  parentName: string;
  parentEmail: string;
  reason: string | null;
};

type StaleAlert = {
  requestId: string;
  childName: string;
  parentName: string;
  parentEmail: string;
  daysSince: number;
};

type AttendanceAlert = {
  lessonId: string;
  scheduledAt: string;
  groupName: string;
  teacherName: string;
  expectedStudents: number;
  markedStudents: number;
};

type OccupancyRow = {
  groupId: string;
  groupName: string;
  level: string | null;
  locationName: string;
  maxStudents: number;
  currentStudents: number;
  freeSeats: number;
  pendingRequests: number;
};

type ConflictRow = {
  type: 'teacher' | 'location';
  resourceName: string;
  scheduledAtA: string;
  scheduledAtB: string;
  groupAName: string;
  groupBName: string;
  locationAName: string;
  locationBName: string;
};

function formatDt(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Warsaw' });
}

function formatTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
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
  const [negotiatingDays, setNegotiatingDays] = useState(3);

  const [occupancy, setOccupancy] = useState<OccupancyRow[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/dashboard?negotiatingDays=${negotiatingDays}`, {
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
  }, [negotiatingDays]);

  const loadOccupancy = useCallback(async () => {
    const r = await fetch('/api/admin/groups/occupancy', { cache: 'no-store' });
    const data = await r.json();
    if (r.ok) setOccupancy(data.rows ?? []);
  }, []);

  const loadConflicts = useCallback(async () => {
    const r = await fetch('/api/admin/schedule/conflicts', { cache: 'no-store' });
    const data = await r.json();
    if (r.ok) setConflicts(data.conflicts ?? []);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    void loadOccupancy();
    void loadConflicts();
  }, [loadOccupancy, loadConflicts]);

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

  const alertTotal =
    dashboard.alerts.resignations.length +
    dashboard.alerts.staleNegotiations.length +
    dashboard.alerts.missingAttendance.length;

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-emerald-100 bg-white p-4 sm:p-5">
        <h2 className="text-xl font-bold text-[#0f6e56] sm:text-2xl">Pulpit operacyjny</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Szybki podgląd zgłoszeń, zajęć, płatności i alertów wymagających uwagi.
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
        title="Centrum alertów"
        description={
          alertTotal === 0
            ? 'Brak aktywnych alertów.'
            : `${alertTotal} alertów wymaga uwagi`
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="text-sm text-zinc-600">
            Negocjacje starsze niż
            <input
              type="number"
              min={1}
              max={30}
              value={negotiatingDays}
              onChange={(e) => setNegotiatingDays(Number(e.target.value) || 3)}
              className="mx-2 w-14 rounded-lg border border-zinc-300 px-2 py-1 text-sm"
            />
            dni
          </label>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-[#0f6e56]"
          >
            Zastosuj
          </button>
        </div>

        <div className="space-y-4">
          {dashboard.alerts.resignations.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-bold text-rose-800">
                Rezygnacje rodziców ({dashboard.alerts.resignations.length})
              </h4>
              <ul className="space-y-2 text-sm">
                {dashboard.alerts.resignations.map((a) => (
                  <li
                    key={a.childId}
                    className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2"
                  >
                    <p className="font-semibold">
                      {a.childName} — {a.parentName}
                    </p>
                    <p className="text-zinc-600">{a.parentEmail}</p>
                    {a.reason && <p className="mt-1 text-zinc-700">Powód: {a.reason}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dashboard.alerts.staleNegotiations.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-bold text-amber-800">
                Zaległe negocjacje ({dashboard.alerts.staleNegotiations.length})
              </h4>
              <ul className="space-y-2 text-sm">
                {dashboard.alerts.staleNegotiations.map((a) => (
                  <li
                    key={a.requestId}
                    className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2"
                  >
                    <p className="font-semibold">
                      {a.childName} — {a.parentName} ({a.daysSince} dni)
                    </p>
                    <p className="text-zinc-600">{a.parentEmail}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dashboard.alerts.missingAttendance.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-bold text-sky-800">
                Brak obecności ({dashboard.alerts.missingAttendance.length})
              </h4>
              <ul className="space-y-2 text-sm">
                {dashboard.alerts.missingAttendance.map((a) => (
                  <li
                    key={a.lessonId}
                    className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2"
                  >
                    <p className="font-semibold">{a.groupName}</p>
                    <p className="text-zinc-600">
                      {formatDt(a.scheduledAt)} · {a.teacherName} · {a.markedStudents}/
                      {a.expectedStudents} uczniów
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>

      <Section
        title="Prognoza obłożenia grup"
        description="Wolne miejsca vs oczekujące zgłoszenia"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-700">
              <tr>
                <th className="px-3 py-2 font-semibold">Grupa</th>
                <th className="px-3 py-2 font-semibold">Poziom</th>
                <th className="px-3 py-2 font-semibold">Lokalizacja</th>
                <th className="px-3 py-2 font-semibold">Zajęte</th>
                <th className="px-3 py-2 font-semibold">Wolne</th>
                <th className="px-3 py-2 font-semibold">Oczekujące</th>
              </tr>
            </thead>
            <tbody>
              {occupancy.map((row) => (
                <tr key={row.groupId} className="border-t border-zinc-100">
                  <td className="px-3 py-2 font-medium">{row.groupName}</td>
                  <td className="px-3 py-2">{row.level ?? '—'}</td>
                  <td className="px-3 py-2">{row.locationName}</td>
                  <td className="px-3 py-2">
                    {row.currentStudents}/{row.maxStudents}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        row.freeSeats === 0
                          ? 'font-semibold text-rose-700'
                          : row.freeSeats <= 2
                            ? 'font-semibold text-amber-700'
                            : 'text-emerald-700'
                      }
                    >
                      {row.freeSeats}
                    </span>
                  </td>
                  <td className="px-3 py-2">{row.pendingRequests}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {occupancy.length === 0 && (
            <p className="py-4 text-center text-sm text-zinc-500">Brak aktywnych grup.</p>
          )}
        </div>
      </Section>

      <Section
        title="Kalendarz konfliktów"
        description="Ten sam lektor lub sala w dwóch miejscach jednocześnie (najbliższy tydzień)"
      >
        {conflicts.length === 0 ? (
          <p className="text-sm text-zinc-500">Brak wykrytych konfliktów.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {conflicts.map((c, i) => (
              <li
                key={`${c.type}-${c.scheduledAtA}-${i}`}
                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
              >
                <p className="font-semibold text-amber-900">
                  {c.type === 'teacher' ? 'Lektor' : 'Sala'}: {c.resourceName}
                </p>
                <p className="text-zinc-700">
                  {formatDt(c.scheduledAtA)} — {c.groupAName} ({c.locationAName})
                </p>
                <p className="text-zinc-700">
                  {formatDt(c.scheduledAtB)} — {c.groupBName} ({c.locationBName})
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
