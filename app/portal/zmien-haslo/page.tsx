'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const PASSWORD_RULES_TEXT =
  'Minimum 8 znaków, w tym duża litera, mała litera, cyfra i znak specjalny.';

interface MeResponse {
  user?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    mustChangePassword?: boolean;
  };
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/user/me', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) router.replace('/portal/login');
          return;
        }
        const data: MeResponse = await res.json();
        if (!cancelled) setMe(data.user ?? null);
      } catch {
        if (!cancelled) router.replace('/portal/login');
      } finally {
        if (!cancelled) setLoadingMe(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cur = currentPassword.trim();
    const next = newPassword.trim();
    const confirm = confirmPassword.trim();

    if (!cur) {
      setError('Podaj aktualne (tymczasowe) hasło z maila.');
      return;
    }
    if (next !== confirm) {
      setError('Powtórzone hasło musi być takie samo jak nowe.');
      return;
    }
    if (next.length < 8) {
      setError('Hasło musi mieć minimum 8 znaków.');
      return;
    }
    if (
      !/[A-Z]/.test(next) ||
      !/[a-z]/.test(next) ||
      !/[0-9]/.test(next) ||
      !/[!@#$%^&*(),.?":{}|<>\-_=+\[\]\\;'/`~]/.test(next)
    ) {
      setError(
        'Hasło musi zawierać dużą literę, małą literę, cyfrę i znak specjalny.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: cur, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? 'Nie udało się zmienić hasła');
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        router.replace('/portal');
        router.refresh();
      }, 1200);
    } catch {
      setError('Błąd połączenia z serwerem');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingMe) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f3c33] to-[#175244] flex items-center justify-center p-4">
        <p className="text-white/80">Ładowanie…</p>
      </div>
    );
  }

  const firstLogin = me?.mustChangePassword === true;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f3c33] to-[#175244] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-[#fdfaf3] mb-2">
            {firstLogin ? 'Ustaw własne hasło' : 'Zmiana hasła'}
          </h1>
          <p className="text-[#fdfaf3]/80 text-sm">
            {firstLogin
              ? 'To Twoje pierwsze logowanie. Aby kontynuować, ustaw własne hasło, którym będziesz logować się na co dzień.'
              : 'Wprowadź aktualne hasło i nowe, które chcesz ustawić.'}
          </p>
        </div>

        <div className="bg-[#f8f6f3] rounded-3xl p-8 shadow-2xl">
          {success && (
            <div className="mb-6 p-4 bg-green-100 border border-green-300 text-green-800 rounded-xl text-sm">
              Hasło zostało zmienione. Przekierowuję do portalu…
            </div>
          )}
          {error && (
            <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="currentPassword"
                className="block text-sm font-medium text-[#1f2933] mb-2"
              >
                {firstLogin ? 'Hasło tymczasowe z maila' : 'Aktualne hasło'}
              </label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 border-2 border-[#1a5c44]/20 rounded-xl focus:border-[#1a5c44] focus:outline-none bg-white text-[#1a5c44]"
                placeholder={firstLogin ? 'np. xxxx-9999' : '••••••••'}
              />
            </div>

            <div>
              <label
                htmlFor="newPassword"
                className="block text-sm font-medium text-[#1f2933] mb-2"
              >
                Nowe hasło
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full px-4 py-3 border-2 border-[#1a5c44]/20 rounded-xl focus:border-[#1a5c44] focus:outline-none bg-white text-[#1a5c44]"
                placeholder="••••••••"
              />
              <p className="mt-2 text-xs text-zinc-500">{PASSWORD_RULES_TEXT}</p>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-[#1f2933] mb-2"
              >
                Powtórz nowe hasło
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full px-4 py-3 border-2 border-[#1a5c44]/20 rounded-xl focus:border-[#1a5c44] focus:outline-none bg-white text-[#1a5c44]"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || success}
              className="w-full px-8 py-3 bg-[#1a5c44] text-[#fdfaf3] font-semibold rounded-full hover:bg-[#144a37] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Zapisywanie…' : 'Ustaw hasło'}
            </button>
          </form>

          {!firstLogin && (
            <div className="mt-6 text-center">
              <a href="/portal" className="text-sm text-[#1a5c44] hover:underline">
                ← Wróć do portalu
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
