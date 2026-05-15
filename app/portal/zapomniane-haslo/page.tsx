'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
      } else {
        setError(data.message || 'Wystąpił błąd');
      }
    } catch {
      setError('Błąd połączenia z serwerem');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f3c33] to-[#175244] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mb-4 flex justify-center">
            <img
              src="/images/2zyrafa2.svg"
              alt="Harry English"
              className="h-20 w-20 object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-[#fdfaf3] mb-2">Resetuj hasło</h1>
          <p className="text-[#fdfaf3]/70">Wyślemy Ci link do ustawienia nowego hasła</p>
        </div>

        <div className="bg-[#f8f6f3] rounded-3xl p-8 shadow-2xl">
          {error && (
            <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-xl text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-100 border border-green-400 text-green-800 rounded-xl text-sm">
              Jeśli konto z tym adresem email istnieje, wysłaliśmy link do resetowania hasła.
              Sprawdź swoją skrzynkę odbiorczą.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#1f2933] mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 py-3 border-2 border-[#1a5c44]/20 rounded-xl focus:border-[#1a5c44] focus:outline-none bg-white text-[#1a5c44]"
                placeholder="twoj@email.pl"
              />
              <p className="mt-2 text-xs text-[#1f2933]/60">
                Wyślemy Ci link do ustawienia nowego hasła na ten adres email.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-8 py-4 bg-[#ffc94a] text-[#3b2a10] font-semibold rounded-full hover:bg-[#ffd76f] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Wysyłanie...' : 'Wyślij link resetujący'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/portal/login" className="text-sm text-[#1a5c44] hover:underline">
              ← Powrót do logowania
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
