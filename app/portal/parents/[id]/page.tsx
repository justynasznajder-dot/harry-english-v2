'use client';

import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type AdminUserDetail = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  confirmed: boolean;
  active: boolean;
  phone: string | null;
};

type ParentProfileDto = {
  id: string;
  address: string | null;
  city: string | null;
  zipCode: string | null;
} | null;

export default function AdminParentEditPage() {
  const router = useRouter();
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [user, setUser] = useState<AdminUserDetail | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [zipCode, setZipCode] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const [uRes, pRes] = await Promise.all([
        fetch(`/api/admin/users/${id}`, { cache: 'no-store' }),
        fetch(`/api/admin/users/${id}/profile`, { cache: 'no-store' }),
      ]);
      const uJson = await uRes.json();
      if (!uRes.ok) {
        throw new Error(uJson.message ?? 'Nie udało się wczytać użytkownika');
      }
      const u = uJson.user as AdminUserDetail;
      if (u.role !== 'PARENT') {
        throw new Error('Ten widok dotyczy wyłącznie kont rodzica');
      }
      setUser(u);
      setFirstName(u.first_name ?? '');
      setLastName(u.last_name ?? '');
      setEmail(u.email ?? '');
      setPhone(u.phone ?? '');
      setConfirmed(Boolean(u.confirmed));

      if (pRes.ok) {
        const pJson = await pRes.json();
        const p = pJson.profile as ParentProfileDto;
        setAddress(p?.address ?? '');
        setCity(p?.city ?? '');
        setZipCode(p?.zipCode ?? '');
      } else {
        setAddress('');
        setCity('');
        setZipCode('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd ładowania');
      setUser(null);
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !user) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const uRes = await fetch(`/api/admin/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          role: 'PARENT',
          confirmed,
          phone: phone.trim() || null,
        }),
      });
      const uData = await uRes.json();
      if (!uRes.ok) throw new Error(uData.message ?? 'Błąd zapisu danych użytkownika');

      const pRes = await fetch(`/api/admin/users/${id}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: address.trim() || null,
          city: city.trim() || null,
          zipCode: zipCode.trim() || null,
        }),
      });
      const pData = await pRes.json();
      if (!pRes.ok) throw new Error(pData.message ?? 'Błąd zapisu profilu rodzica');

      setUser((prev) =>
        prev
          ? {
              ...prev,
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              email: email.trim(),
              phone: phone.trim() || null,
              confirmed,
            }
          : prev
      );
      setSuccessMessage('Zmiany zapisane.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!id || !user) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      if (user.active) {
        const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? 'Nie udało się dezaktywować');
        setUser({ ...user, active: false });
        setSuccessMessage('Konto zostało dezaktywowane.');
      } else {
        const res = await fetch(`/api/admin/users/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restore: true }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? 'Nie udało się przywrócić');
        setUser({ ...user, active: true });
        setSuccessMessage('Konto zostało aktywowane.');
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd operacji');
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
          <h1 className="text-xl font-bold text-[#0f6e56] sm:text-2xl">Edycja rodzica</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Pełny widok konta i adresu — tutaj możesz rozbudowywać dane w przyszłości.
          </p>
        </header>

        {loading ? (
          <div className="rounded-2xl border border-emerald-100 bg-white p-10 text-center text-zinc-600">
            Wczytywanie…
          </div>
        ) : error && !user ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
            {error}
          </div>
        ) : user ? (
          <form onSubmit={handleSave} className="space-y-6">
            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-semibold text-[#1e3a4c]">Dane konta</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-zinc-700">
                  Imię
                  <input
                    required
                    className="rounded-xl border border-emerald-200 px-3 py-2 text-zinc-900"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-zinc-700">
                  Nazwisko
                  <input
                    required
                    className="rounded-xl border border-emerald-200 px-3 py-2 text-zinc-900"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-zinc-700 sm:col-span-2">
                  Email
                  <input
                    required
                    type="email"
                    className="rounded-xl border border-emerald-200 px-3 py-2 text-zinc-900"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-zinc-700 sm:col-span-2">
                  Telefon
                  <input
                    type="tel"
                    className="rounded-xl border border-emerald-200 px-3 py-2 text-zinc-900"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+48 …"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="h-4 w-4 rounded border-emerald-300 text-[#0f6e56] focus:ring-[#0f6e56]"
                  />
                  Konto potwierdzone
                </label>
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                Status:{' '}
                <span className="font-medium text-zinc-800">
                  {user.active ? 'aktywny' : 'nieaktywny'}
                </span>
              </p>
            </section>

            <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-semibold text-[#1e3a4c]">Profil rodzica — adres</h2>
              <div className="mt-4 grid gap-4">
                <label className="flex flex-col gap-1 text-sm text-zinc-700">
                  Ulica i numer
                  <input
                    className="rounded-xl border border-emerald-200 px-3 py-2 text-zinc-900"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm text-zinc-700">
                    Miasto
                    <input
                      className="rounded-xl border border-emerald-200 px-3 py-2 text-zinc-900"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-zinc-700">
                    Kod pocztowy (max 10 znaków)
                    <input
                      maxLength={10}
                      className="rounded-xl border border-emerald-200 px-3 py-2 text-zinc-900"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                    />
                  </label>
                </div>
              </div>
            </section>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="cursor-pointer rounded-lg border border-zinc-800/40 bg-white px-3 py-1 text-[#1e3a4c] transition hover:border-[#0f6e56] hover:bg-emerald-50 hover:text-[#0f6e56] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Zapisywanie…' : 'Zapisz zmiany'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleToggleActive()}
                className={`rounded-lg px-3 py-1 text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  user.active ? 'admin-user-toggle-danger' : 'admin-user-toggle-success'
                }`}
              >
                {user.active ? 'Dezaktywuj konto' : 'Aktywuj konto'}
              </button>
            </div>
            {successMessage ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {successMessage}
              </div>
            ) : null}
          </form>
        ) : null}
      </div>
    </div>
  );
}
