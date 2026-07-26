'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { paymentTypeShortLabel } from '@/lib/payment-labels';

type ChildDetail = {
  id: string;
  parent_id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  active: boolean;
  confirmed: boolean;
  client_number: string | null;
  lesson_unit_price: string | null;
  monthly_unit_price: string | null;
  yearly_unit_price: string | null;
  parent_first_name: string;
  parent_last_name: string;
  parent_email: string;
  parent_client_number: string | null;
};

type Membership = {
  id: string;
  group_id: string;
  group_name: string;
  group_price_monthly: string | null;
  group_price_yearly: string | null;
  group_price_per_lesson: string | null;
};

type PaymentInfo = {
  payment_type: string | null;
  contract_id: string;
  status: string;
  signed_at: string | null;
};

function priceFromDb(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  const n = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return '';
  return String(n);
}

function formatGroupDefault(value: string | null | undefined): string {
  const n = priceFromDb(value);
  return n ? `${n} PLN` : 'brak';
}

export default function AdminChildProfilePage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [child, setChild] = useState<ChildDetail | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [payment, setPayment] = useState<PaymentInfo | null>(null);

  const [monthlyPrice, setMonthlyPrice] = useState('');
  const [yearlyPrice, setYearlyPrice] = useState('');
  const [lessonPrice, setLessonPrice] = useState('');

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
      const c = data.child as ChildDetail;
      const m = (data.membership as Membership | null) ?? null;
      const p = (data.payment as PaymentInfo | null) ?? null;
      setChild(c);
      setMembership(m);
      setPayment(p);
      setMonthlyPrice(priceFromDb(c.monthly_unit_price));
      setYearlyPrice(priceFromDb(c.yearly_unit_price));
      setLessonPrice(priceFromDb(c.lesson_unit_price));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd ładowania');
      setChild(null);
      setMembership(null);
      setPayment(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const handleSaveRates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!child) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`/api/admin/children/${child.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthlyUnitPrice: monthlyPrice.trim() || null,
          yearlyUnitPrice: yearlyPrice.trim() || null,
          lessonUnitPrice: lessonPrice.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Nie udało się zapisać stawek');
      setSuccessMessage('Stawki zapisane.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f3c33] to-[#175244] p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Link
            href="/portal"
            className="text-sm font-semibold text-[#fdfaf3]/90 underline-offset-4 hover:text-[#ffc94a] hover:underline"
          >
            ← Powrót do panelu
          </Link>
        </div>

        <header className="mb-6 rounded-2xl border border-emerald-900/30 bg-[#f8f6f3] px-5 py-4 shadow-lg">
          <h1 className="text-xl font-bold text-[#0f6e56] sm:text-2xl">Profil dziecka</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Grupa, system płatności i indywidualne stawki.
          </p>
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
            {successMessage ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {successMessage}
              </div>
            ) : null}

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
                <div className="sm:col-span-2">
                  <dt className="text-zinc-500">Rodzic</dt>
                  <dd className="text-zinc-900">
                    <Link
                      href={`/portal/parents/${child.parent_id}`}
                      className="font-medium text-[#0f6e56] underline-offset-2 hover:underline"
                    >
                      {child.parent_first_name} {child.parent_last_name}
                    </Link>
                    {child.parent_client_number ? (
                      <span className="text-zinc-500"> ({child.parent_client_number})</span>
                    ) : null}
                    <div className="text-zinc-600">{child.parent_email}</div>
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
                <div>
                  <dt className="text-zinc-500">System płatności</dt>
                  <dd className="font-medium text-zinc-900">
                    {payment?.payment_type
                      ? paymentTypeShortLabel(payment.payment_type)
                      : 'Brak podpisanej umowy'}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-semibold text-[#1e3a4c]">Stawki indywidualne</h2>
              <form onSubmit={handleSaveRates} className="mt-4 space-y-4">
                <p className="text-sm text-zinc-600">
                  Nadpisanie należy do profilu dziecka (nie do grupy). Puste pole = stawka domyślna
                  grupy
                  {membership
                    ? `: ratalna ${formatGroupDefault(membership.group_price_monthly)}, jednorazowa ${formatGroupDefault(membership.group_price_yearly)}, za zajęcia ${formatGroupDefault(membership.group_price_per_lesson)}.`
                    : ' (po przypisaniu do grupy).'}
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="flex flex-col gap-1 text-sm text-zinc-700">
                    Ratalna (PLN)
                    <input
                      type="text"
                      inputMode="decimal"
                      className="rounded-xl border border-emerald-200 px-3 py-2 text-zinc-900"
                      value={monthlyPrice}
                      onChange={(e) => setMonthlyPrice(e.target.value)}
                      placeholder="Domyślna"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-zinc-700">
                    Jednorazowa (PLN)
                    <input
                      type="text"
                      inputMode="decimal"
                      className="rounded-xl border border-emerald-200 px-3 py-2 text-zinc-900"
                      value={yearlyPrice}
                      onChange={(e) => setYearlyPrice(e.target.value)}
                      placeholder="Domyślna"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-zinc-700">
                    Za poj. zajęcia (PLN)
                    <input
                      type="text"
                      inputMode="decimal"
                      className="rounded-xl border border-emerald-200 px-3 py-2 text-zinc-900"
                      value={lessonPrice}
                      onChange={(e) => setLessonPrice(e.target.value)}
                      placeholder="Domyślna"
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg border border-zinc-800/40 bg-white px-3 py-1 text-[#1e3a4c] transition hover:border-[#0f6e56] hover:bg-emerald-50 hover:text-[#0f6e56] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Zapisywanie…' : 'Zapisz stawki'}
                </button>
              </form>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
