'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  warnings?: Array<{
    type: string;
    message: string;
    groupIds?: string[];
    groupNames?: string[];
  }>;
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
  lessonsPerWeek?: 1 | 2 | null;
  generatedLessonsCount?: number;
  children: Array<{
    childId: string;
    childName: string;
    birthYear: string | null;
    lessonsPerWeek?: 1 | 2 | null;
    notifyStatus: 'signed' | 'notified' | 'pending';
  }>;
};

function formatGeneratedLessonsLabel(count: number): string {
  if (count === 1) return '1 zajęcie';
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${count} zajęcia`;
  }
  return `${count} zajęć`;
}

function childAttendsOnceWeekly(
  child: GroupRosterRow['children'][number],
  groupLessonsPerWeek: number | null | undefined,
): boolean {
  if (Number(groupLessonsPerWeek) !== 2) return false;
  return Number(child.lessonsPerWeek) === 1;
}

function RosterChildTiles({
  children,
}: {
  children: GroupRosterRow['children'];
}) {
  if (children.length === 0) {
    return <p className="text-sm text-zinc-500">Brak</p>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {children.map((child) => {
        const tile = ROSTER_CHILD_TILE[child.notifyStatus ?? 'pending'];
        return (
          <li
            key={child.childId}
            title={tile.title}
            className={`rounded-lg border px-2.5 py-1 text-sm ${tile.className}`}
          >
            {child.childName}
            {child.birthYear ? (
              <span className="ml-1 text-xs opacity-70">({child.birthYear})</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

const ROSTER_CHILD_TILE: Record<
  GroupRosterRow['children'][number]['notifyStatus'],
  { className: string; title: string }
> = {
  signed: {
    className: 'border-emerald-300 bg-emerald-100 text-emerald-950',
    title: 'Umowa podpisana',
  },
  notified: {
    className: 'border-sky-300 bg-sky-100 text-sky-950',
    title: 'Wysłano mail z grupą / terminem',
  },
  pending: {
    className: 'border-amber-300 bg-amber-100 text-amber-950',
    title: 'Brak maila o terminie — szkic grupy',
  },
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

export default function ManagerDashboardPanel({
  onOpenGroup,
}: {
  onOpenGroup?: (groupId: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  const [groupRoster, setGroupRoster] = useState<GroupRosterRow[]>([]);
  const [rosterLocation, setRosterLocation] = useState('');
  const [rosterTeacher, setRosterTeacher] = useState('');
  const [rosterLevel, setRosterLevel] = useState('');
  const [rosterChildSearch, setRosterChildSearch] = useState('');

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

  const rosterFilterOptions = useMemo(() => {
    const locations = new Set<string>();
    const teachers = new Set<string>();
    const levels = new Set<string>();
    for (const g of groupRoster) {
      if (g.locationName && g.locationName !== '—') locations.add(g.locationName);
      if (g.teacherName && g.teacherName !== '—') teachers.add(g.teacherName);
      if (g.level?.trim()) levels.add(g.level.trim());
    }
    return {
      locations: [...locations].sort((a, b) => a.localeCompare(b, 'pl')),
      teachers: [...teachers].sort((a, b) => a.localeCompare(b, 'pl')),
      levels: [...levels].sort((a, b) => a.localeCompare(b, 'pl', { numeric: true })),
    };
  }, [groupRoster]);

  const filteredGroupRoster = useMemo(() => {
    const childQuery = rosterChildSearch.trim().toLocaleLowerCase('pl');
    return groupRoster
      .filter((g) => {
        if (rosterLocation && g.locationName !== rosterLocation) return false;
        if (rosterTeacher && g.teacherName !== rosterTeacher) return false;
        if (rosterLevel && (g.level?.trim() ?? '') !== rosterLevel) return false;
        if (
          childQuery &&
          !g.children.some((c) => c.childName.toLocaleLowerCase('pl').includes(childQuery))
        ) {
          return false;
        }
        return true;
      })
      .map((g) => {
        if (!childQuery) return g;
        return {
          ...g,
          children: g.children.filter((c) =>
            c.childName.toLocaleLowerCase('pl').includes(childQuery),
          ),
        };
      })
      .filter((g) => !childQuery || g.children.length > 0);
  }, [groupRoster, rosterLocation, rosterTeacher, rosterLevel, rosterChildSearch]);

  const hasRosterFilters = Boolean(
    rosterLocation || rosterTeacher || rosterLevel || rosterChildSearch.trim(),
  );

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

  const warnings = dashboard.warnings ?? [];

  return (
    <div className="space-y-6">
      <header
        className={`rounded-2xl border p-4 sm:p-5 ${
          warnings.length > 0
            ? 'border-red-300 bg-red-50'
            : 'border-emerald-100 bg-white'
        }`}
      >
        <h2
          className={`text-xl font-bold sm:text-2xl ${
            warnings.length > 0 ? 'text-red-800' : 'text-[#0f6e56]'
          }`}
        >
          Zgłoszenia operacyjne
        </h2>
        {warnings.length > 0 ? (
          <div className="mt-3 space-y-2">
            {warnings.map((w) => {
              const groups = (w.groupIds ?? []).map((id, i) => ({
                id,
                name: w.groupNames?.[i] ?? id,
              }));
              return (
                <div
                  key={`${w.type}-${(w.groupIds ?? []).join(',') || w.message}`}
                  className="rounded-xl border border-red-200 bg-white/70 px-3 py-2.5 text-sm text-red-800"
                >
                  <p className="font-semibold">{w.message}</p>
                  {groups.length > 0 ? (
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {groups.map((g) => (
                        <li key={g.id}>
                          {onOpenGroup ? (
                            <button
                              type="button"
                              className="font-medium underline decoration-red-400 underline-offset-2 hover:text-red-950"
                              onClick={() => onOpenGroup(g.id)}
                            >
                              {g.name}
                            </button>
                          ) : (
                            <span className="font-medium">{g.name}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : w.groupNames && w.groupNames.length > 0 ? (
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {w.groupNames.map((name) => (
                        <li key={name}>
                          <span className="font-medium">{name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-600">
            Nie ma pilnych zgłoszeń operacyjnych.
          </p>
        )}
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
          description={`${dashboard.lessonsThisWeek.length} lekcji (od dziś do niedzieli)`}
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
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-zinc-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-emerald-300 bg-emerald-100" />
            Umowa podpisana
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-sky-300 bg-sky-100" />
            Mail z terminem wysłany
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-amber-300 bg-amber-100" />
            Jeszcze bez informacji o terminie
          </span>
        </div>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="flex w-full max-w-[220px] min-w-[160px] flex-col gap-1 text-xs font-medium text-zinc-600">
            Szukaj dziecka
            <input
              type="search"
              value={rosterChildSearch}
              onChange={(e) => setRosterChildSearch(e.target.value)}
              placeholder="Imię lub nazwisko…"
              className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-[#0f6e56] placeholder:text-zinc-400 focus:ring-2"
            />
          </label>
          <label className="flex min-w-[160px] flex-col gap-1 text-xs font-medium text-zinc-600">
            Lokalizacja
            <select
              className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-zinc-900"
              value={rosterLocation}
              onChange={(e) => setRosterLocation(e.target.value)}
            >
              <option value="">Wszystkie</option>
              {rosterFilterOptions.locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[160px] flex-col gap-1 text-xs font-medium text-zinc-600">
            Lektor
            <select
              className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-zinc-900"
              value={rosterTeacher}
              onChange={(e) => setRosterTeacher(e.target.value)}
            >
              <option value="">Wszyscy</option>
              {rosterFilterOptions.teachers.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[120px] flex-col gap-1 text-xs font-medium text-zinc-600">
            Poziom grupy
            <select
              className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-zinc-900"
              value={rosterLevel}
              onChange={(e) => setRosterLevel(e.target.value)}
            >
              <option value="">Wszystkie</option>
              {rosterFilterOptions.levels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          {hasRosterFilters ? (
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
              onClick={() => {
                setRosterLocation('');
                setRosterTeacher('');
                setRosterLevel('');
                setRosterChildSearch('');
              }}
            >
              Wyczyść filtry
            </button>
          ) : null}
        </div>
        {filteredGroupRoster.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {groupRoster.length === 0
              ? 'Brak aktywnych grup.'
              : rosterChildSearch.trim()
                ? 'Brak dziecka o tym imieniu lub nazwisku.'
                : 'Brak grup dla wybranych filtrów.'}
          </p>
        ) : (
          <div className="space-y-3">
            {filteredGroupRoster.map((group) => (
              <div
                key={group.groupId}
                className="rounded-xl border border-emerald-100 bg-emerald-50/30 px-3 py-3 sm:px-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  {onOpenGroup ? (
                    <button
                      type="button"
                      className="text-left font-semibold text-[#0f6e56] hover:underline"
                      onClick={() => onOpenGroup(group.groupId)}
                    >
                      {group.groupName}
                    </button>
                  ) : (
                    <p className="font-semibold text-[#0f6e56]">{group.groupName}</p>
                  )}

                  <div className="flex flex-col items-end gap-0.5">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {Number(group.lessonsPerWeek) === 2 ? (
                        <span
                          className="rounded-md border border-emerald-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-[#0f6e56]"
                          title="Zajęcia 2× w tygodniu"
                        >
                          2× tydz.
                        </span>
                      ) : (
                        <span
                          className="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-zinc-600"
                          title="Zajęcia 1× w tygodniu"
                        >
                          1× tydz.
                        </span>
                      )}
                      <p className="text-xs font-medium text-zinc-500">
                        {group.children.length}{' '}
                        {group.children.length === 1
                          ? 'dziecko'
                          : group.children.length >= 2 && group.children.length <= 4
                            ? 'dzieci'
                            : 'dzieci'}
                      </p>
                    </div>
                    <p
                      className="text-xs font-medium text-zinc-500"
                      title="Wygenerowane zajęcia w bieżącym roku szkolnym"
                    >
                      {formatGeneratedLessonsLabel(Number(group.generatedLessonsCount) || 0)}
                    </p>
                  </div>
                </div>
                <p className="mt-1 text-sm text-zinc-600">
                  {group.level ? `${group.level} · ` : ''}
                  {group.locationName}
                  {group.teacherName !== '—' ? ` · ${group.teacherName}` : ''}
                </p>
                {group.children.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-500">Brak dzieci w grupie.</p>
                ) : Number(group.lessonsPerWeek) === 2 ? (
                  <div className="mt-2 space-y-2">
                    {(() => {
                      const once = group.children.filter((c) =>
                        childAttendsOnceWeekly(c, group.lessonsPerWeek),
                      );
                      const twice = group.children.filter(
                        (c) => !childAttendsOnceWeekly(c, group.lessonsPerWeek),
                      );
                      return (
                        <>
                          <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                              1× / tydz. ({once.length})
                            </p>
                            <RosterChildTiles children={once} />
                          </div>
                          <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                              2× / tydz. ({twice.length})
                            </p>
                            <RosterChildTiles children={twice} />
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="mt-2">
                    <RosterChildTiles children={group.children} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
