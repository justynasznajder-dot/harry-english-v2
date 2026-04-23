'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, Suspense } from 'react';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const validatePassword = (password: string): string[] => {
    const errors: string[] = [];
    if (password.length < 8) errors.push("Minimum 8 znaków");
    if (!/[A-Z]/.test(password)) errors.push("Minimum 1 wielka litera");
    if (!/[a-z]/.test(password)) errors.push("Minimum 1 mała litera");
    if (!/[0-9]/.test(password)) errors.push("Minimum 1 cyfra");
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push("Minimum 1 znak specjalny");
    return errors;
  };

  const getPasswordStrength = (password: string): { strength: number; label: string; color: string } => {
    if (!password) return { strength: 0, label: "", color: "" };
    
    const validationErrors = validatePassword(password);
    const strength = 5 - validationErrors.length;
    
    if (strength <= 2) return { strength, label: "Słabe", color: "bg-red-500" };
    if (strength === 3) return { strength, label: "Średnie", color: "bg-yellow-500" };
    if (strength === 4) return { strength, label: "Dobre", color: "bg-blue-500" };
    return { strength, label: "Bardzo dobre", color: "bg-green-500" };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Walidacja
    const newErrors: Record<string, string> = {};

    const passwordErrors = validatePassword(formData.password);
    if (passwordErrors.length > 0) {
      newErrors.password = "Hasło nie spełnia wymagań";
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Hasła nie są identyczne";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        // Przekieruj do strony głównej po 3 sekundach
        setTimeout(() => {
          router.push('/');
        }, 3000);
      } else {
        setErrors({ form: data.message || 'Wystąpił błąd' });
      }
    } catch (error) {
      setErrors({ form: 'Wystąpił błąd. Spróbuj ponownie.' });
    } finally {
      setIsLoading(false);
    }
  };

  const passwordStrength = getPasswordStrength(formData.password);

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f3c33] to-[#175244] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Nieprawidłowy link
            </h1>
            <p className="text-gray-600 mb-6">
              Link do resetowania hasła jest nieprawidłowy lub wygasł.
            </p>
            <button
              onClick={() => router.push('/')}
              className="px-6 py-3 bg-[#ffc94a] text-[#3b2a10] font-semibold rounded-full hover:bg-[#ffd76f] transition-colors"
            >
              Powrót do strony głównej
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f3c33] to-[#175244] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center">
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Hasło zostało zmienione!
            </h1>
            <p className="text-gray-600 mb-6">
              Twoje hasło zostało pomyślnie zmienione. Za chwilę zostaniesz przekierowany do strony głównej, gdzie możesz się zalogować.
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#175244]"></div>
              Przekierowywanie...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f3c33] to-[#175244] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🦒</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Ustaw nowe hasło
          </h1>
          <p className="text-gray-600">
            Wprowadź nowe hasło dla swojego konta
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {errors.form && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {errors.form}
            </div>
          )}

          {/* Password */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Nowe hasło *
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className={`w-full rounded-lg border ${errors.password ? 'border-red-300' : 'border-gray-300'} px-4 py-2.5 pr-10 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all`}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Password strength indicator */}
            {formData.password && (
              <div className="mt-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${passwordStrength.color} transition-all duration-300`}
                      style={{ width: `${(passwordStrength.strength / 5) * 100}%` }}
                    />
                  </div>
                  <span className={`text-xs font-medium ${passwordStrength.color.replace('bg-', 'text-')}`}>
                    {passwordStrength.label}
                  </span>
                </div>
              </div>
            )}

            {/* Password requirements */}
            <div className="mt-2 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs font-semibold text-gray-700 mb-2">Wymagania hasła:</p>
              <ul className="text-xs text-gray-600 space-y-1">
                {[
                  { test: formData.password.length >= 8, text: "Minimum 8 znaków" },
                  { test: /[A-Z]/.test(formData.password), text: "Minimum 1 wielka litera" },
                  { test: /[a-z]/.test(formData.password), text: "Minimum 1 mała litera" },
                  { test: /[0-9]/.test(formData.password), text: "Minimum 1 cyfra" },
                  { test: /[!@#$%^&*(),.?":{}|<>]/.test(formData.password), text: "Minimum 1 znak specjalny (!@#$%...)" },
                ].map((req, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    {req.test ? (
                      <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    )}
                    <span className={req.test ? "text-green-700" : ""}>{req.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Powtórz nowe hasło *
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className={`w-full rounded-lg border ${errors.confirmPassword ? 'border-red-300' : 'border-gray-300'} px-4 py-2.5 pr-10 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all`}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirmPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            {errors.confirmPassword && <p className="mt-1 text-xs text-red-600">{errors.confirmPassword}</p>}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-full bg-[#ffc94a] px-6 py-3 text-[#3b2a10] font-semibold hover:bg-[#ffd76f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Zmienianie hasła..." : "Zmień hasło"}
          </button>

          <button
            type="button"
            onClick={() => router.push('/')}
            className="w-full text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            ← Powrót do strony głównej
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-[#0f3c33] to-[#175244] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
