'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  resolveStudentListPipelineStage,
  STUDENT_LIST_PIPELINE_STAGES,
  type StudentListPipelineStage,
} from '@/lib/enrollment-status';
import { isParentInComplimentaryList } from '@/lib/complimentary-parent-list';
import type { ComplimentaryParentRow } from '@/lib/complimentary-parent-list';
import { downloadStudentPipelineXlsx } from '@/lib/student-pipeline-xlsx';

type PipelineRow = {
  childId: string;
  childProfileId?: string | null;
  childName: string;
  parentId: string;
  parentName: string;
  parentEmail: string;
  enrollmentStatus: string;
  proposalGroup: string | null;
  contractStatus: string | null;
  groupName: string | null;
  billingStatus: string | null;
  renewalStatus: string | null;
};

const STAGE_ORDER: Record<StudentListPipelineStage, number> = {
  Zgłoszenie: 0,
  'Przypisany do grupy': 1,
  'Umowa wysłana': 2,
  'Umowa podpisana': 3,
};

function PipelineBadge({
  value,
  tone = 'neutral',
}: {
  value: string | null;
  tone?: 'neutral' | 'done' | 'current';
}) {
  if (!value) {
    return <span className="text-xs text-zinc-400">—</span>;
  }
  const cls =
    tone === 'done'
      ? 'bg-emerald-100 text-emerald-800'
      : tone === 'current'
        ? 'bg-[#0f6e56] text-white'
        : 'bg-zinc-100 text-zinc-700';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {value}
    </span>
  );
}

function stageTone(
  stage: StudentListPipelineStage,
  current: StudentListPipelineStage,
): 'neutral' | 'done' | 'current' {
  if (stage === current) return 'current';
  if (STAGE_ORDER[stage] < STAGE_ORDER[current]) return 'done';
  return 'neutral';
}

function PipelineTable({
  rows,
  complimentaryMode = false,
}: {
  rows: PipelineRow[];
  /** Tryb bez opłat — bez kolumn umowy; flow kończy się na grupie. */
  complimentaryMode?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-zinc-500">Brak uczniów.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table
        className={`text-left text-xs sm:text-sm ${complimentaryMode ? 'min-w-[520px]' : 'min-w-[820px]'}`}
      >
        <thead className="bg-zinc-50 text-zinc-700">
          <tr>
            <th className="px-2 py-2 font-semibold">Uczeń</th>
            <th className="px-2 py-2 font-semibold">Rodzic</th>
            <th className="px-2 py-2 font-semibold">Zgłoszenie</th>
            <th className="px-2 py-2 font-semibold">Przypisany do grupy</th>
            {!complimentaryMode && (
              <>
                <th className="px-2 py-2 font-semibold">Umowa wysłana</th>
                <th className="px-2 py-2 font-semibold">Umowa podpisana</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const groupLabel = row.groupName || row.proposalGroup;
            const current = resolveStudentListPipelineStage({
              enrollmentStatus: row.enrollmentStatus,
              hasGroup: Boolean(groupLabel),
              contractStatus: complimentaryMode ? null : row.contractStatus,
              complimentary: complimentaryMode,
            });
            const sentLabel =
              !complimentaryMode &&
              (current === 'Umowa wysłana' ||
                STAGE_ORDER[current] > STAGE_ORDER['Umowa wysłana'])
                ? row.contractStatus?.trim() || 'Tak'
                : null;
            const signedLabel =
              !complimentaryMode && current === 'Umowa podpisana' ? 'Tak' : null;

            return (
              <tr key={row.childId} className="border-t border-zinc-100">
                <td className="px-2 py-2 font-medium">
                  {row.childProfileId ? (
                    <Link
                      href={`/portal/children/${row.childProfileId}`}
                      className="text-[#0f6e56] hover:underline"
                    >
                      {row.childName}
                    </Link>
                  ) : (
                    row.childName
                  )}
                </td>
                <td className="px-2 py-2">{row.parentName}</td>
                <td className="px-2 py-2">
                  <PipelineBadge value="Tak" tone={stageTone('Zgłoszenie', current)} />
                </td>
                <td className="px-2 py-2">
                  <PipelineBadge
                    value={
                      STAGE_ORDER[current] >= STAGE_ORDER['Przypisany do grupy']
                        ? groupLabel || 'Tak'
                        : null
                    }
                    tone={stageTone('Przypisany do grupy', current)}
                  />
                </td>
                {!complimentaryMode && (
                  <>
                    <td className="px-2 py-2">
                      <PipelineBadge
                        value={sentLabel}
                        tone={stageTone('Umowa wysłana', current)}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <PipelineBadge
                        value={signedLabel}
                        tone={stageTone('Umowa podpisana', current)}
                      />
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function StudentPipelinePanel({
  embedded = false,
  complimentaryParents = [],
}: {
  embedded?: boolean;
  complimentaryParents?: ComplimentaryParentRow[];
}) {
  const [pipeline, setPipeline] = useState<PipelineRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const q = query.trim() ? `?search=${encodeURIComponent(query.trim())}` : '';
      const r = await fetch(`/api/admin/pipeline${q}`, { cache: 'no-store' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message ?? 'Błąd pobierania listy uczniów');
      setPipeline(data.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania listy uczniów');
      setPipeline([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(search), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const { withContracts, withoutContracts } = useMemo(() => {
    const withContracts: PipelineRow[] = [];
    const withoutContracts: PipelineRow[] = [];
    for (const row of pipeline) {
      const complimentary = isParentInComplimentaryList(
        { id: row.parentId, email: row.parentEmail },
        complimentaryParents,
      );
      if (complimentary) withoutContracts.push(row);
      else withContracts.push(row);
    }
    return { withContracts, withoutContracts };
  }, [pipeline, complimentaryParents]);

  const exportXlsx = useCallback(async () => {
    if (pipeline.length === 0 || exporting) return;
    setExporting(true);
    setError(null);
    try {
      await downloadStudentPipelineXlsx({
        withContracts,
        withoutContracts,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się wygenerować pliku Excel');
    } finally {
      setExporting(false);
    }
  }, [pipeline.length, exporting, withContracts, withoutContracts]);

  const flowLabel = STUDENT_LIST_PIPELINE_STAGES.join(' → ');

  const content = (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj ucznia lub rodzica…"
          className="w-full max-w-md rounded-xl border border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={loading || exporting || pipeline.length === 0}
          onClick={() => void exportXlsx()}
          className="rounded-xl border border-[#0f6e56] bg-white px-3 py-2 text-sm font-semibold text-[#0f6e56] transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting ? 'Generowanie…' : 'Pobierz Excel'}
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Ładowanie…</p>
      ) : pipeline.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">Brak uczniów.</p>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-zinc-600">
            Razem <span className="font-semibold text-zinc-800">{pipeline.length}</span>
            {' · '}z umowami {withContracts.length}
            {' · '}bez umów {withoutContracts.length}
          </p>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-zinc-800">
              Z umowami{' '}
              <span className="font-normal text-zinc-500">({withContracts.length})</span>
            </h3>
            <PipelineTable rows={withContracts} />
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-zinc-800">
              Bez umów{' '}
              <span className="font-normal text-zinc-500">({withoutContracts.length})</span>
            </h3>
            <p className="text-xs text-zinc-500">
              Tryb bez opłat — zgłoszenie → przypisany do grupy (bez umowy).
            </p>
            <PipelineTable rows={withoutContracts} complimentaryMode />
          </section>
        </div>
      )}
    </>
  );

  if (embedded) return content;

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-emerald-100 bg-white p-4 sm:p-5">
        <h2 className="text-xl font-bold text-[#0f6e56] sm:text-2xl">Lista uczniów</h2>
        <p className="mt-1 text-sm text-zinc-600">{flowLabel}</p>
      </header>
      <section className="rounded-2xl border border-emerald-100 bg-white p-4 sm:p-5">
        {content}
      </section>
    </div>
  );
}
