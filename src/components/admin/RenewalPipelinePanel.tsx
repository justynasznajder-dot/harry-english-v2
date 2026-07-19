'use client';

import { useCallback, useEffect, useState } from 'react';

type RenewalPipelineRow = {
  renewalId: string;
  childName: string;
  parentName: string;
  renewalStatusLabel: string;
  proposalGroup: string | null;
  contractStatus: string | null;
  targetGroup: string | null;
};

function PipelineBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-xs text-zinc-400">—</span>;
  return (
    <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
      {value}
    </span>
  );
}

export default function RenewalPipelinePanel() {
  const [rows, setRows] = useState<RenewalPipelineRow[]>([]);
  const [season, setSeason] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const q = query.trim() ? `?search=${encodeURIComponent(query.trim())}` : '';
      const r = await fetch(`/api/admin/renewals/pipeline${q}`, { cache: 'no-store', credentials: 'include' });
      const data = (await r.json()) as {
        message?: string;
        season?: string;
        rows?: RenewalPipelineRow[];
      };
      if (!r.ok) throw new Error(data.message ?? 'Błąd pobierania pipeline');
      setSeason(data.season ?? null);
      setRows(data.rows ?? []);
      if (data.message && (data.rows?.length ?? 0) === 0) setError(data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania pipeline');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(search), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  return (
    <div className="space-y-3">
      {season && (
        <p className="text-sm text-zinc-600">
          Pipeline odnowień na rok <strong>{season}</strong> — potwierdzenie → propozycja → umowa →
          grupa (jak przy zapisie).
        </p>
      )}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Szukaj ucznia lub rodzica…"
        className="w-full max-w-md rounded-xl border border-zinc-300 px-3 py-2 text-sm"
      />
      {error && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
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
                <th className="px-2 py-2 font-semibold">Status odnowienia</th>
                <th className="px-2 py-2 font-semibold">Propozycja grupy</th>
                <th className="px-2 py-2 font-semibold">Umowa</th>
                <th className="px-2 py-2 font-semibold">Grupa docelowa</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.renewalId} className="border-t border-zinc-100">
                  <td className="px-2 py-2 font-medium">{row.childName}</td>
                  <td className="px-2 py-2">{row.parentName}</td>
                  <td className="px-2 py-2">
                    <PipelineBadge value={row.renewalStatusLabel} />
                  </td>
                  <td className="px-2 py-2">
                    <PipelineBadge value={row.proposalGroup} />
                  </td>
                  <td className="px-2 py-2">
                    <PipelineBadge value={row.contractStatus} />
                  </td>
                  <td className="px-2 py-2">
                    <PipelineBadge value={row.targetGroup} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !error && (
            <p className="py-8 text-center text-sm text-zinc-500">Brak aktywnych odnowień w pipeline.</p>
          )}
        </div>
      )}
    </div>
  );
}
