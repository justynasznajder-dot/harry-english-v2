'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatEnrollmentStatusLabel } from '@/lib/enrollment-status';

type ContactHistoryData = {
  parent: { id: string; name: string; email: string; accessLevel: string };
  children: Array<{
    id: string;
    name: string;
    accessLevel: string;
    groupName: string | null;
    resignationRequested: boolean;
  }>;
  messages: Array<{
    id: string;
    subject: string | null;
    contentPreview: string;
    createdAt: string;
    senderName: string;
    senderRole: string;
  }>;
  enrollments: Array<{
    id: string;
    childName: string;
    status: string;
    proposedGroup: string | null;
    createdAt: string;
  }>;
  billing: Array<{
    childName: string;
    periodMonth: string;
    status: string;
    amount: string;
  }>;
  renewals: Array<{
    childName: string;
    season: string;
    status: string;
    initiatedAt: string;
  }>;
};

function formatDt(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
}

export default function ContactHistoryPanel({
  parentId,
  childId,
}: {
  parentId?: string;
  childId?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ContactHistoryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!parentId && !childId) return;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (parentId) q.set('parentId', parentId);
      if (childId) q.set('childId', childId);
      const r = await fetch(`/api/admin/contact-history?${q}`, { cache: 'no-store' });
      const json = await r.json();
      if (!r.ok) throw new Error(json.message ?? 'Błąd pobierania historii');
      setData(json as ContactHistoryData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania historii');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [parentId, childId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!parentId && !childId) return null;

  if (loading) {
    return <p className="text-sm text-zinc-500">Ładowanie historii kontaktu…</p>;
  }

  if (error) {
    return <p className="text-sm text-rose-700">{error}</p>;
  }

  if (!data) return null;

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
      <h4 className="font-bold text-[#0f6e56]">Historia kontaktu — {data.parent.name}</h4>
      <p className="text-sm text-zinc-600">{data.parent.email}</p>

      {data.children.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Dzieci
          </p>
          <ul className="space-y-1 text-sm">
            {data.children.map((c) => (
              <li key={c.id} className="rounded-lg bg-white px-3 py-2">
                <span className="font-medium">{c.name}</span>
                {' — '}
                {formatEnrollmentStatusLabel(c.accessLevel)}
                {c.groupName && ` · ${c.groupName}`}
                {c.resignationRequested && (
                  <span className="ml-2 text-xs font-semibold text-rose-700">Rezygnacja</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.messages.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Wiadomości ({data.messages.length})
          </p>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {data.messages.map((m) => (
              <li key={m.id} className="rounded-lg bg-white px-3 py-2">
                <p className="font-medium">{m.subject ?? '(bez tematu)'}</p>
                <p className="text-xs text-zinc-500">
                  {formatDt(m.createdAt)} · {m.senderName} ({m.senderRole})
                </p>
                <p className="mt-1 text-zinc-600">{m.contentPreview}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.enrollments.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Zgłoszenia
          </p>
          <ul className="space-y-1 text-sm">
            {data.enrollments.map((e) => (
              <li key={e.id} className="rounded-lg bg-white px-3 py-2">
                {e.childName} — {formatEnrollmentStatusLabel(e.status)}
                {e.proposedGroup && ` · ${e.proposedGroup}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.billing.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Płatności
          </p>
          <ul className="space-y-1 text-sm">
            {data.billing.map((b, i) => (
              <li key={`${b.periodMonth}-${i}`} className="rounded-lg bg-white px-3 py-2">
                {b.childName} · {b.periodMonth} · {b.status} · {b.amount} zł
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.renewals.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Odnowienia
          </p>
          <ul className="space-y-1 text-sm">
            {data.renewals.map((r, i) => (
              <li key={`${r.season}-${i}`} className="rounded-lg bg-white px-3 py-2">
                {r.childName} · {r.season} · {r.status}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
