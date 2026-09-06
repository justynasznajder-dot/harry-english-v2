'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  resolveStudentListPipelineStage,
  STUDENT_LIST_PIPELINE_STAGES,
  type StudentListPipelineStage,
} from '@/lib/enrollment-status';

type PipelineRow = {
  childId: string;
  childName: string;
  parentName: string;
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
  'Czeka na umowę': 2,
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

export default function StudentPipelinePanel({ embedded = false }: { embedded?: boolean }) {
  const [pipeline, setPipeline] = useState<PipelineRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const flowLabel = STUDENT_LIST_PIPELINE_STAGES.join(' → ');

  const content = (
    <>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Szukaj ucznia lub rodzica…"
        className="mb-4 w-full max-w-md rounded-xl border border-zinc-300 px-3 py-2 text-sm"
      />

      {error && (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Ładowanie…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[820px] text-left text-xs sm:text-sm">
            <thead className="bg-zinc-50 text-zinc-700">
              <tr>
                <th className="px-2 py-2 font-semibold">Uczeń</th>
                <th className="px-2 py-2 font-semibold">Rodzic</th>
                <th className="px-2 py-2 font-semibold">Zgłoszenie</th>
                <th className="px-2 py-2 font-semibold">Przypisany do grupy</th>
                <th className="px-2 py-2 font-semibold">Czeka na umowę</th>
                <th className="px-2 py-2 font-semibold">Umowa podpisana</th>
              </tr>
            </thead>
            <tbody>
              {pipeline.map((row) => {
                const groupLabel = row.groupName || row.proposalGroup;
                const current = resolveStudentListPipelineStage({
                  enrollmentStatus: row.enrollmentStatus,
                  hasGroup: Boolean(groupLabel),
                  contractStatus: row.contractStatus,
                });
                const waitingLabel =
                  current === 'Czeka na umowę' || STAGE_ORDER[current] > STAGE_ORDER['Czeka na umowę']
                    ? row.contractStatus?.trim() || 'Czeka na umowę'
                    : null;
                const signedLabel =
                  current === 'Umowa podpisana' ? 'Tak' : null;

                return (
                  <tr key={row.childId} className="border-t border-zinc-100">
                    <td className="px-2 py-2 font-medium">{row.childName}</td>
                    <td className="px-2 py-2">{row.parentName}</td>
                    <td className="px-2 py-2">
                      <PipelineBadge
                        value="Tak"
                        tone={stageTone('Zgłoszenie', current)}
                      />
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
                    <td className="px-2 py-2">
                      <PipelineBadge
                        value={waitingLabel}
                        tone={stageTone('Czeka na umowę', current)}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <PipelineBadge
                        value={signedLabel}
                        tone={stageTone('Umowa podpisana', current)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pipeline.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-500">Brak uczniów.</p>
          )}
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
