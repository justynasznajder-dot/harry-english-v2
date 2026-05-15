'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: username.trim(), password: password.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.mustChangePassword || data.user?.mustChangePassword) {
          router.push('/portal/zmien-haslo');
        } else {
          router.push('/portal');
        }
        router.refresh();
      } else {
        setError(data.message || data.error || 'Błąd logowania');
      }
    } catch (err) {
      setError('Błąd połączenia z serwerem');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f3c33] to-[#175244] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="mb-4 flex justify-center">
            <img
              src="/images/2zyrafa2.svg"
              alt="Harry English"
              className="h-20 w-20 object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-[#fdfaf3] mb-2">
            Portal Harry English
          </h1>
          <p className="text-[#fdfaf3]/70">Zaloguj się do swojego konta</p>
        </div>

        {/* Formularz */}
        <div className="bg-[#f8f6f3] rounded-3xl p-8 shadow-2xl">
          {error && (
            <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Username */}
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-[#1f2933] mb-2"
              >
                Nazwa użytkownika
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="w-full px-4 py-3 border-2 border-[#1a5c44]/20 rounded-xl focus:border-[#1a5c44] focus:outline-none bg-white text-[#1a5c44]"
                placeholder="jan.kowalski"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-[#1f2933] mb-2"
              >
                Hasło
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 border-2 border-[#1a5c44]/20 rounded-xl focus:border-[#1a5c44] focus:outline-none bg-white text-[#1a5c44]"
                placeholder="••••••••"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full px-8 py-4 bg-[#1a5c44] text-[#fdfaf3] font-semibold rounded-full hover:bg-[#144a37] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Logowanie...' : 'Zaloguj się'}
            </button>
          </form>

          {/* Powrót */}
          <div className="mt-6 text-center">
            <a
              href="/"
              className="text-sm text-[#1a5c44] hover:underline"
            >
              ← Powrót do strony głównej
            </a>
          </div>
        </div>

        {/* Pomoc */}
        <div className="mt-6 text-center text-sm text-[#fdfaf3]/60">
          Nie pamiętasz hasła?{' '}
          <Link href="/portal/zapomniane-haslo" className="text-[#ffc94a] hover:underline">
            Zresetuj je
          </Link>
        </div>
      </div>
    </div>
  );
}
