'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatEnrollmentStatusLabel } from '@/lib/enrollment-status';

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

function PipelineBadge({ value }: { value: string | null }) {
  if (!value) {
    return <span className="text-xs text-zinc-400">—</span>;
  }
  return (
    <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
      {value}
    </span>
  );
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
      if (!r.ok) throw new Error(data.message ?? 'Błąd pobierania pipeline');
      setPipeline(data.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania pipeline');
      setPipeline([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(search), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

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
          <table className="min-w-[900px] text-left text-xs sm:text-sm">
            <thead className="bg-zinc-50 text-zinc-700">
              <tr>
                <th className="px-2 py-2 font-semibold">Uczeń</th>
                <th className="px-2 py-2 font-semibold">Rodzic</th>
                <th className="px-2 py-2 font-semibold">Zgłoszenie</th>
                <th className="px-2 py-2 font-semibold">Propozycja</th>
                <th className="px-2 py-2 font-semibold">Umowa</th>
                <th className="px-2 py-2 font-semibold">Grupa</th>
                <th className="px-2 py-2 font-semibold">Płatności</th>
                <th className="px-2 py-2 font-semibold">Odnowienie</th>
              </tr>
            </thead>
            <tbody>
              {pipeline.map((row) => (
                <tr key={row.childId} className="border-t border-zinc-100">
                  <td className="px-2 py-2 font-medium">{row.childName}</td>
                  <td className="px-2 py-2">{row.parentName}</td>
                  <td className="px-2 py-2">
                    <PipelineBadge value={formatEnrollmentStatusLabel(row.enrollmentStatus)} />
                  </td>
                  <td className="px-2 py-2">
                    <PipelineBadge value={row.proposalGroup} />
                  </td>
                  <td className="px-2 py-2">
                    <PipelineBadge value={row.contractStatus} />
                  </td>
                  <td className="px-2 py-2">
                    <PipelineBadge value={row.groupName} />
                  </td>
                  <td className="px-2 py-2">
                    <PipelineBadge value={row.billingStatus} />
                  </td>
                  <td className="px-2 py-2">
                    <PipelineBadge value={row.renewalStatus} />
                  </td>
                </tr>
              ))}
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
        <h2 className="text-xl font-bold text-[#0f6e56] sm:text-2xl">Pipeline ucznia</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Zgłoszenie → propozycja → umowa → grupa → płatności → odnowienie — pełny status w jednym
          wierszu.
        </p>
      </header>
      <section className="rounded-2xl border border-emerald-100 bg-white p-4 sm:p-5">
        {content}
      </section>
    </div>
  );
}
