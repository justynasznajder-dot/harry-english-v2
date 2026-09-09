'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { paymentTypeShortLabel } from '@/lib/payment-labels';
import PortalAppShell from '@/src/components/PortalAppShell';

type ChildDetail = {
  id: string;
  parent_id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  active: boolean;
  confirmed: boolean;
  client_number: string | null;
  parent_first_name: string;
  parent_last_name: string;
  parent_email: string;
  parent_client_number: string | null;
};

type Membership = {
  id: string;
  group_id: string;
  group_name: string;
  lessons_per_week: number | null;
  group_lessons_per_week: number | null;
};

type PaymentInfo = {
  payment_type: string | null;
  contract_id: string;
  status: string;
  signed_at: string | null;
};

export default function AdminChildProfilePage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [child, setChild] = useState<ChildDetail | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [complimentaryAccess, setComplimentaryAccess] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/children/${id}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message ?? 'Nie udało się wczytać dziecka');
      }
      setChild(data.child as ChildDetail);
      setMembership((data.membership as Membership | null) ?? null);
      setPayment((data.payment as PaymentInfo | null) ?? null);
      setComplimentaryAccess(Boolean(data.complimentaryAccess));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd ładowania');
      setChild(null);
      setMembership(null);
      setPayment(null);
      setComplimentaryAccess(false);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PortalAppShell
      showManagerNav
      managerActiveTab="families"
      maxWidthClassName="max-w-6xl"
    >
      <div className="mx-auto max-w-3xl">
        <div className="mb-4">
          <Link
            href="/portal?tab=families"
            className="text-sm font-semibold text-[#fdfaf3]/90 underline-offset-4 hover:text-[#ffc94a] hover:underline"
          >
            ← Powrót do panelu
          </Link>
        </div>

        <header className="mb-6 rounded-2xl border border-emerald-900/30 bg-[#f8f6f3] px-5 py-4 shadow-lg">
          <h1 className="text-xl font-bold text-[#0f6e56] sm:text-2xl">Profil dziecka</h1>
          <p className="mt-1 text-sm text-zinc-600">Grupa i system płatności.</p>
        </header>

        {loading ? (
          <div className="rounded-2xl border border-emerald-100 bg-white p-10 text-center text-zinc-600">
            Wczytywanie…
          </div>
        ) : error && !child ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">{error}</div>
        ) : child ? (
          <div className="space-y-6">
            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-semibold text-[#1e3a4c]">Rodzic</h2>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <Link
                    href={`/portal/parents/${child.parent_id}`}
                    className="text-base font-medium text-[#0f6e56] underline-offset-2 hover:underline"
                  >
                    {child.parent_first_name} {child.parent_last_name}
                  </Link>
                  {child.parent_client_number ? (
                    <span className="ml-1 text-zinc-500">({child.parent_client_number})</span>
                  ) : null}
                  <div className="mt-0.5 text-zinc-600">{child.parent_email}</div>
                </div>
                <Link
                  href={`/portal/parents/${child.parent_id}`}
                  className="shrink-0 rounded-lg bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-800 hover:bg-emerald-50 hover:text-[#0f6e56]"
                >
                  Profil rodzica
                </Link>
              </div>
            </section>

            <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-semibold text-[#1e3a4c]">Dane dziecka</h2>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500">Imię i nazwisko</dt>
                  <dd className="font-medium text-zinc-900">
                    {child.first_name} {child.last_name}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">ID</dt>
                  <dd className="font-mono text-zinc-900">{child.client_number ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Data urodzenia</dt>
                  <dd className="text-zinc-900">{child.birth_date}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Status</dt>
                  <dd className="text-zinc-900">
                    {child.confirmed ? 'potwierdzony' : 'niepotwierdzony'}
                    {' · '}
                    {child.active ? 'aktywny' : 'nieaktywny'}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-semibold text-[#1e3a4c]">Grupa i płatności</h2>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500">Aktualna grupa</dt>
                  <dd className="font-medium text-zinc-900">
                    {membership ? (
                      <Link
                        href={`/portal/groups/${membership.group_id}`}
                        className="text-[#0f6e56] underline-offset-2 hover:underline"
                      >
                        {membership.group_name}
                      </Link>
                    ) : (
                      'Brak aktywnej grupy'
                    )}
                  </dd>
                </div>
                {membership && Number(membership.group_lessons_per_week) === 2 ? (
                  <div>
                    <dt className="text-zinc-500">Frekwencja w grupie</dt>
                    <dd className="font-medium text-zinc-900">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          Number(membership.lessons_per_week) === 1
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-zinc-100 text-zinc-700'
                        }`}
                      >
                        {Number(membership.lessons_per_week) === 1
                          ? '1× w tygodniu'
                          : '2× w tygodniu'}
                      </span>
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-zinc-500">System płatności</dt>
                  <dd className="font-medium text-zinc-900">
                    {complimentaryAccess
                      ? 'Tryb bez umowy'
                      : payment?.payment_type
                        ? paymentTypeShortLabel(payment.payment_type)
                        : 'Brak podpisanej umowy'}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        ) : null}
      </div>
    </PortalAppShell>
  );
}
