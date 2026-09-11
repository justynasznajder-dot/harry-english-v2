'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { paymentTypeShortLabel } from '@/lib/payment-labels';
import { formatGroupNameForDisplay } from '@/src/data/harryEnglishLevels';
import AdminEntityChangeHistory from '@/src/components/admin/AdminEntityChangeHistory';

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
  group_change_notice?: boolean;
  group_before_label?: string | null;
};

type GroupOption = {
  id: string;
  name: string;
  active: boolean;
};

type PaymentInfo = {
  payment_type: string | null;
  contract_id: string;
  status: string;
  signed_at: string | null;
};

type Props = {
  childId: string;
  /** W modalu: bez nagłówka strony / pełnej nawigacji. */
  embedded?: boolean;
  onOpenParent?: (parentId: string) => void;
  onChanged?: () => void;
};

export default function AdminChildProfilePanel({
  childId,
  embedded = false,
  onOpenParent,
  onChanged,
}: Props) {
  const id = childId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const [child, setChild] = useState<ChildDetail | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [complimentaryAccess, setComplimentaryAccess] = useState(false);
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupNoticeBusy, setGroupNoticeBusy] = useState(false);
  const [groupTransferBusy, setGroupTransferBusy] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [confirmed, setConfirmed] = useState(false);

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
      const nextChild = data.child as ChildDetail;
      setChild(nextChild);
      setFirstName(nextChild.first_name ?? '');
      setLastName(nextChild.last_name ?? '');
      setBirthDate(String(nextChild.birth_date ?? '').slice(0, 10));
      setConfirmed(Boolean(nextChild.confirmed));
      setMembership((data.membership as Membership | null) ?? null);
      setSelectedGroupId(
        ((data.membership as Membership | null)?.group_id ?? '').trim(),
      );
      setPayment((data.payment as PaymentInfo | null) ?? null);
      setComplimentaryAccess(Boolean(data.complimentaryAccess));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd ładowania');
      setChild(null);
      setMembership(null);
      setSelectedGroupId('');
      setPayment(null);
      setComplimentaryAccess(false);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/groups', { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as {
        groups?: GroupOption[];
      };
      if (!res.ok) return;
      const list = (data.groups ?? [])
        .filter((g) => g.active !== false)
        .map((g) => ({ id: g.id, name: g.name, active: g.active !== false }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
      setGroupOptions(list);
    } catch {
      /* ignore — select zostanie pusty */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || !child) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`/api/admin/children/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          birth_date: birthDate.trim(),
          confirmed,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? 'Błąd zapisu danych dziecka');
      }
      const updated = (data as { child?: ChildDetail }).child;
      if (updated) {
        setChild({
          ...child,
          ...updated,
          parent_id: child.parent_id,
          parent_first_name: child.parent_first_name,
          parent_last_name: child.parent_last_name,
          parent_email: child.parent_email,
          parent_client_number: child.parent_client_number,
          first_name: updated.first_name ?? firstName.trim(),
          last_name: updated.last_name ?? lastName.trim(),
          birth_date: String(updated.birth_date ?? birthDate).slice(0, 10),
          confirmed: Boolean(updated.confirmed),
          active: Boolean(updated.active ?? child.active),
          client_number: updated.client_number ?? child.client_number,
        });
        setFirstName(updated.first_name ?? firstName.trim());
        setLastName(updated.last_name ?? lastName.trim());
        setBirthDate(String(updated.birth_date ?? birthDate).slice(0, 10));
        setConfirmed(Boolean(updated.confirmed));
      } else {
        setChild({
          ...child,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          birth_date: birthDate.trim(),
          confirmed,
        });
      }
      setSuccessMessage('Zmiany zapisane.');
      setHistoryRefreshKey((k) => k + 1);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!id || !child) return;
    if (child.active) {
      const ok = window.confirm(
        `Dezaktywować ${child.first_name} ${child.last_name}? Dziecko stanie się nieaktywne (jeśli to jedyne aktywne dziecko rodzica, konto rodzica też może zostać dezaktywowane).`,
      );
      if (!ok) return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      if (child.active) {
        const res = await fetch(`/api/admin/children/${id}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (data as { message?: string }).message ?? 'Nie udało się dezaktywować dziecka',
          );
        }
        setChild({ ...child, active: false });
        setSuccessMessage('Dziecko zostało dezaktywowane.');
      } else {
        const res = await fetch(`/api/admin/children/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restore: true }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (data as { message?: string }).message ?? 'Nie udało się aktywować dziecka',
          );
        }
        setChild({ ...child, active: true });
        setSuccessMessage('Dziecko zostało aktywowane.');
      }
      setHistoryRefreshKey((k) => k + 1);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd operacji');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleGroupChangeNotice = async (enabled: boolean) => {
    if (!id || !membership) return;
    setGroupNoticeBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/children/${id}/group-change-notice`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupChangeNotice: enabled }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        groupChangeNotice?: boolean;
        groupBeforeLabel?: string | null;
      };
      if (!res.ok) {
        throw new Error(data.message ?? 'Nie udało się zapisać flagi zmiany grupy');
      }
      setMembership((prev) =>
        prev
          ? {
              ...prev,
              group_change_notice: Boolean(data.groupChangeNotice),
              group_before_label: data.groupBeforeLabel ?? prev.group_before_label,
            }
          : prev,
      );
      setSuccessMessage(data.message ?? (enabled ? 'Zmiana grupy włączona' : 'Zmiana grupy wyłączona'));
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd zapisu flagi');
    } finally {
      setGroupNoticeBusy(false);
    }
  };

  const handleTransferGroup = async () => {
    if (!id || !membership) return;
    const nextId = selectedGroupId.trim();
    if (!nextId) {
      setError('Wybierz grupę docelową');
      return;
    }
    if (nextId === membership.group_id) {
      setError('Uczeń jest już w wybranej grupie');
      return;
    }
    setGroupTransferBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/children/${id}/group`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: nextId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        membership?: Membership;
      };
      if (!res.ok) {
        throw new Error(data.message ?? 'Nie udało się przenieść ucznia');
      }
      if (data.membership) {
        setMembership({
          ...membership,
          ...data.membership,
          lessons_per_week: membership.lessons_per_week,
          group_lessons_per_week: membership.group_lessons_per_week,
        });
        setSelectedGroupId(data.membership.group_id);
      }
      setSuccessMessage(data.message ?? 'Uczeń przeniesiony');
      setHistoryRefreshKey((k) => k + 1);
      onChanged?.();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd przenoszenia');
    } finally {
      setGroupTransferBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-white p-10 text-center text-zinc-600">
        Wczytywanie…
      </div>
    );
  }

  if (error && !child) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">{error}</div>
    );
  }

  if (!child) return null;

  const paymentLabel = complimentaryAccess
    ? 'Tryb bez umowy'
    : payment?.payment_type
      ? paymentTypeShortLabel(payment.payment_type)
      : 'Brak podpisanej umowy';

  return (
    <div className={embedded ? 'mx-auto max-w-3xl' : undefined}>
      {!embedded ? (
        <header className="mb-6 rounded-2xl border border-emerald-900/30 bg-[#f8f6f3] px-5 py-4 shadow-lg">
          <h1 className="text-xl font-bold text-[#0f6e56] sm:text-2xl">Edycja dziecka</h1>
          <p className="mt-1 text-sm text-zinc-600">Dane dziecka, grupa i system płatności.</p>
        </header>
      ) : null}

      <form onSubmit={handleSave} className="space-y-6">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-[#1e3a4c]">Dane dziecka</h2>
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
            <label className="flex flex-col gap-1 text-sm text-zinc-700">
              Data urodzenia
              <input
                required
                type="date"
                className="rounded-xl border border-emerald-200 px-3 py-2 text-zinc-900"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-700">
              ID
              <input
                readOnly
                className="rounded-xl border border-emerald-200 bg-zinc-50 px-3 py-2 font-mono text-zinc-900"
                value={child.client_number ?? '—'}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="h-4 w-4 rounded border-emerald-300 text-[#0f6e56] focus:ring-[#0f6e56]"
              />
              Dziecko potwierdzone
            </label>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Status:{' '}
            <span className="font-medium text-zinc-800">
              {child.active ? 'aktywny' : 'nieaktywny'}
            </span>
          </p>
        </section>

        <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#1e3a4c]">Grupa i płatności</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Aktualne przypisanie do grupy i system płatności z podpisanej umowy.
              </p>
            </div>
            {membership ? (
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  className="accent-emerald-700"
                  checked={Boolean(membership.group_change_notice)}
                  disabled={groupNoticeBusy || saving}
                  onChange={(e) => void handleToggleGroupChangeNotice(e.target.checked)}
                />
                <span className="font-medium">zmiana grupy</span>
              </label>
            ) : null}
          </div>
          {membership && !membership.group_change_notice ? (
            <p className="mt-2 text-xs text-amber-800">
              Żeby przenieść ucznia do innej grupy, zaznacz „zmiana grupy”. Rodzic zobaczy informację
              w panelu (bez maila).
            </p>
          ) : null}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {membership && membership.group_change_notice ? (
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label className="flex flex-col gap-1 text-sm text-zinc-700">
                  Nowa grupa
                  <select
                    className="w-full min-w-0 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-zinc-900"
                    value={selectedGroupId}
                    disabled={groupTransferBusy || saving}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                  >
                    {groupOptions.map((g) => (
                      <option key={g.id} value={g.id}>
                        {formatGroupNameForDisplay(g.name)}
                      </option>
                    ))}
                  </select>
                </label>
                {membership.group_before_label ? (
                  <p className="text-xs text-zinc-500">
                    Snapshot poprzedniej grupy:{' '}
                    <span className="font-medium text-zinc-700">
                      {formatGroupNameForDisplay(membership.group_before_label)}
                    </span>
                    {membership.group_before_label !== membership.group_name ? (
                      <>
                        {' '}
                        → aktualnie:{' '}
                        <span className="font-medium text-zinc-800">
                          {formatGroupNameForDisplay(membership.group_name)}
                        </span>
                      </>
                    ) : null}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={
                    groupTransferBusy ||
                    saving ||
                    !selectedGroupId ||
                    selectedGroupId === membership.group_id
                  }
                  onClick={() => void handleTransferGroup()}
                  className="w-fit rounded-lg border border-[#0f6e56]/40 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-[#0f6e56] hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {groupTransferBusy ? 'Przenoszenie…' : 'Zapisz nową grupę'}
                </button>
              </div>
            ) : (
              <label className="flex flex-col gap-1 text-sm text-zinc-700">
                Aktualna grupa
                <input
                  readOnly
                  className="rounded-xl border border-emerald-200 bg-zinc-50 px-3 py-2 text-zinc-900"
                  value={
                    membership?.group_name
                      ? formatGroupNameForDisplay(membership.group_name)
                      : 'Brak aktywnej grupy'
                  }
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm text-zinc-700">
              System płatności
              <input
                readOnly
                className="rounded-xl border border-emerald-200 bg-zinc-50 px-3 py-2 text-zinc-900"
                value={paymentLabel}
              />
            </label>
            {membership && Number(membership.group_lessons_per_week) === 2 ? (
              <label className="flex flex-col gap-1 text-sm text-zinc-700">
                Frekwencja w grupie
                <input
                  readOnly
                  className="rounded-xl border border-emerald-200 bg-zinc-50 px-3 py-2 text-zinc-900"
                  value={
                    Number(membership.lessons_per_week) === 1 ? '1× w tygodniu' : '2× w tygodniu'
                  }
                />
              </label>
            ) : null}
          </div>
          {membership ? (
            <p className="mt-3 text-sm">
              <Link
                href={`/portal/groups/${membership.group_id}`}
                className="font-medium text-[#0f6e56] underline-offset-2 hover:underline"
              >
                Otwórz profil grupy
              </Link>
            </p>
          ) : null}
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
              child.active ? 'admin-user-toggle-danger' : 'admin-user-toggle-success'
            }`}
          >
            {child.active ? 'Dezaktywuj' : 'Aktywuj'}
          </button>
        </div>
        {successMessage ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {successMessage}
          </div>
        ) : null}
      </form>

      <section className="mt-6 rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-[#1e3a4c]">Rodzic</h2>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {onOpenParent ? (
              <button
                type="button"
                onClick={() => onOpenParent(child.parent_id)}
                className="font-medium text-[#0f6e56] underline-offset-2 hover:underline"
              >
                {child.parent_first_name} {child.parent_last_name}
              </button>
            ) : (
              <Link
                href={`/portal/parents/${child.parent_id}`}
                className="font-medium text-[#0f6e56] underline-offset-2 hover:underline"
              >
                {child.parent_first_name} {child.parent_last_name}
              </Link>
            )}
            {child.parent_client_number ? (
              <span className="ml-1 text-xs text-zinc-500">({child.parent_client_number})</span>
            ) : null}
            <p className="mt-0.5 text-xs text-zinc-500">{child.parent_email}</p>
          </div>
          {onOpenParent ? (
            <button
              type="button"
              onClick={() => onOpenParent(child.parent_id)}
              className="shrink-0 rounded-lg bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-800 hover:bg-emerald-50 hover:text-[#0f6e56]"
            >
              Profil
            </button>
          ) : (
            <Link
              href={`/portal/parents/${child.parent_id}`}
              className="shrink-0 rounded-lg bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-800 hover:bg-emerald-50 hover:text-[#0f6e56]"
            >
              Profil
            </Link>
          )}
        </div>
      </section>

      <div className="mt-6">
        <AdminEntityChangeHistory
          entityType="child"
          entityId={id}
          refreshKey={historyRefreshKey}
        />
      </div>
    </div>
  );
}
