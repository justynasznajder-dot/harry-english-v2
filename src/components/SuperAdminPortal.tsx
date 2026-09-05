'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type SchoolRow = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  active: boolean;
  renewalsOpen: boolean;
};

type SchoolUserRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  active: boolean;
  access_level: string;
  phone: string | null;
  school_id: string | null;
  children_count: number | null;
  last_login: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  MANAGER: 'Zarządca',
  TEACHER: 'Nauczyciel',
  PARENT: 'Rodzic',
  CHILD: 'Uczeń',
  ACCOUNTANT: 'Księgowa',
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] || role;
}

export default function SuperAdminPortal() {
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [schoolsError, setSchoolsError] = useState<string | null>(null);

  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [users, setUsers] = useState<SchoolUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const selectedSchool = useMemo(
    () => schools.find((s) => s.id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId]
  );

  const loadSchools = useCallback(async () => {
    setSchoolsLoading(true);
    setSchoolsError(null);
    try {
      const res = await fetch('/api/admin/schools', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'Nie udało się pobrać szkół');
      }
      setSchools(Array.isArray(data.schools) ? data.schools : []);
    } catch (e) {
      setSchoolsError(e instanceof Error ? e.message : 'Błąd ładowania szkół');
      setSchools([]);
    } finally {
      setSchoolsLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async (schoolId: string) => {
    setUsersLoading(true);
    setUsersError(null);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/schools/${schoolId}/users`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'Nie udało się pobrać użytkowników');
      }
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : 'Błąd ładowania użytkowników');
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  useEffect(() => {
    if (!selectedSchoolId) {
      setUsers([]);
      return;
    }
    loadUsers(selectedSchoolId);
  }, [selectedSchoolId, loadUsers]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (!q) return true;
      const hay = `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, userSearch, roleFilter]);

  const startImpersonation = async (userId: string) => {
    setImpersonatingId(userId);
    setActionError(null);
    try {
      const res = await fetch('/api/admin/impersonate/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'Nie udało się otworzyć panelu');
      }
      window.location.href = '/portal';
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Błąd impersonacji');
      setImpersonatingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-[#f8f6f3] p-5 shadow-xl sm:p-6">
        <h2 className="text-lg font-bold text-[#1e3a4c]">Szkoły</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Wybierz szkołę, aby zobaczyć użytkowników i otworzyć ich panel.
        </p>

        {schoolsLoading ? (
          <p className="mt-4 text-sm text-zinc-500">Ładowanie szkół…</p>
        ) : schoolsError ? (
          <p className="mt-4 text-sm text-red-700">{schoolsError}</p>
        ) : schools.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">Brak szkół w bazie.</p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            {schools.map((school) => {
              const selected = school.id === selectedSchoolId;
              return (
                <li key={school.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSchoolId(school.id);
                      setUserSearch('');
                      setRoleFilter('');
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                      selected ? 'bg-[#d8f3ea]' : 'hover:bg-zinc-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#1e3a4c]">
                        {school.name}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        {[school.city, school.slug].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                        school.active
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      {school.active ? 'Aktywna' : 'Nieaktywna'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {selectedSchoolId && (
        <section className="rounded-3xl bg-[#f8f6f3] p-5 shadow-xl sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#1e3a4c]">
                Użytkownicy — {selectedSchool?.name || '…'}
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Otwórz panel wybranego użytkownika bez hasła (pełna impersonacja).
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="search"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Szukaj: imię, email…"
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-[#1e3a4c] outline-none focus:border-[#0f6e56]"
              />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-[#1e3a4c] outline-none focus:border-[#0f6e56]"
              >
                <option value="">Wszystkie role</option>
                <option value="MANAGER">Zarządca</option>
                <option value="TEACHER">Nauczyciel</option>
                <option value="PARENT">Rodzic</option>
                <option value="CHILD">Uczeń</option>
                <option value="ACCOUNTANT">Księgowa</option>
              </select>
            </div>
          </div>

          {actionError && (
            <p className="mt-3 text-sm text-red-700">{actionError}</p>
          )}

          {usersLoading ? (
            <p className="mt-4 text-sm text-zinc-500">Ładowanie użytkowników…</p>
          ) : usersError ? (
            <p className="mt-4 text-sm text-red-700">{usersError}</p>
          ) : filteredUsers.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">Brak użytkowników spełniających filtr.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Użytkownik</th>
                    <th className="px-4 py-3 font-semibold">Rola</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Akcja</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#1e3a4c]">
                          {u.first_name} {u.last_name}
                        </p>
                        <p className="text-xs text-zinc-500">{u.email}</p>
                        {u.role === 'PARENT' && u.children_count != null && (
                          <p className="mt-0.5 text-xs text-zinc-400">
                            Dzieci: {u.children_count}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#1e3a4c]">{roleLabel(u.role)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            u.active
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-zinc-200 text-zinc-600'
                          }`}
                        >
                          {u.active ? 'Aktywny' : 'Nieaktywny'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={!u.active || impersonatingId === u.id}
                          onClick={() => startImpersonation(u.id)}
                          className="rounded-full border border-zinc-800/55 bg-white px-3 py-1.5 text-xs font-semibold text-[#1e3a4c] shadow-sm transition-colors hover:border-[#0f6e56] hover:bg-[#d8f3ea] hover:text-[#0f6e56] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {impersonatingId === u.id ? 'Otwieranie…' : 'Otwórz panel'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
