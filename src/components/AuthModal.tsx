"use client";

import { useState, useEffect } from "react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "select" | "login" | "register" | "forgot-password";
}

export default function AuthModal({ isOpen, onClose, initialMode = "select" }: AuthModalProps) {
  const [mode, setMode] = useState<"select" | "login" | "register" | "forgot-password">(initialMode);

  // Resetuj tryb do initialMode gdy modal się otwiera
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
    }
  }, [isOpen, initialMode]);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    students: [
      {
        firstName: "",
        lastName: "",
        birthYear: "",
        location: "" as "" | "Paniówki" | "Halemba" | "Orzegów" | "Kochłowice" | "Bielszowice",
      },
    ],
    rodoConsent: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false);

  if (!isOpen) return null;

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Zapisz token/sesję
        localStorage.setItem("userToken", data.token);
        localStorage.setItem("userName", data.userName);
        if (data.user) {
          localStorage.setItem("userEmail", data.user.email);
          localStorage.setItem("userInfo", JSON.stringify(data.user));
        }
        
        // Przekieruj do portalu
        window.location.href = "/portal";
      } else {
        setErrors({ form: data.message || "Nieprawidłowy email lub hasło" });
      }
    } catch (error) {
      setErrors({ form: "Wystąpił błąd. Spróbuj ponownie." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Walidacja
    const newErrors: Record<string, string> = {};

    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Podaj prawidłowy adres email";
    }

    const passwordErrors = validatePassword(formData.password);
    if (passwordErrors.length > 0) {
      newErrors.password = "Hasło nie spełnia wymagań";
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Hasła nie są identyczne";
    }

    if (!formData.firstName.trim()) {
      newErrors.firstName = "Pole wymagane";
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = "Pole wymagane";
    }

    // Walidacja dzieci
    const currentYear = new Date().getFullYear();
    formData.students.forEach((student, index) => {
      if (!student.firstName.trim()) {
        newErrors[`student_${index}_firstName`] = "Pole wymagane";
      }
      if (!student.lastName.trim()) {
        newErrors[`student_${index}_lastName`] = "Pole wymagane";
      }
      const birthYear = parseInt(student.birthYear);
      if (!birthYear || birthYear < 2000 || birthYear > currentYear) {
        newErrors[`student_${index}_birthYear`] = `Podaj prawidłowy rok urodzenia (2000-${currentYear})`;
      }
      if (!student.location) {
        newErrors[`student_${index}_location`] = "Wybierz lokalizację";
      }
    });

    if (!formData.rodoConsent) {
      newErrors.rodoConsent = "Zgoda jest wymagana";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          confirmPassword: formData.confirmPassword,
          firstName: formData.firstName,
          lastName: formData.lastName,
          students: formData.students,
          rodoConsent: formData.rodoConsent,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Zapisz token/sesję
        localStorage.setItem("userToken", data.token);
        localStorage.setItem("userName", data.userName);
        if (data.user) {
          localStorage.setItem("userEmail", data.user.email);
          localStorage.setItem("userInfo", JSON.stringify(data.user));
        }
        
        // Przekieruj do portalu
        window.location.href = "/portal";
      } else {
        setErrors({ form: data.message || "Nie udało się utworzyć konta" });
      }
    } catch (error) {
      setErrors({ form: "Wystąpił błąd. Spróbuj ponownie." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);
    setForgotPasswordSuccess(false);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email }),
      });

      const data = await response.json();

      if (response.ok) {
        setForgotPasswordSuccess(true);
      } else {
        setErrors({ form: data.message || "Wystąpił błąd" });
      }
    } catch (error) {
      setErrors({ form: "Wystąpił błąd. Spróbuj ponownie." });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      email: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
      students: [
        {
          firstName: "",
          lastName: "",
          birthYear: "",
          location: "" as "" | "Paniówki" | "Halemba" | "Orzegów" | "Kochłowice" | "Bielszowice",
        },
      ],
      rodoConsent: false,
    });
    setErrors({});
    setForgotPasswordSuccess(false);
  };

  const addStudent = () => {
    setFormData({
      ...formData,
      students: [
        ...formData.students,
        {
          firstName: "",
          lastName: "",
          birthYear: "",
          location: "" as "" | "Paniówki" | "Halemba" | "Orzegów" | "Kochłowice" | "Bielszowice",
        },
      ],
    });
  };

  const removeStudent = (index: number) => {
    if (formData.students.length > 1) {
      setFormData({
        ...formData,
        students: formData.students.filter((_, i) => i !== index),
      });
    }
  };

  const updateStudent = (index: number, field: string, value: string) => {
    const updatedStudents = [...formData.students];
    (updatedStudents[index] as any)[field] = value;
    setFormData({
      ...formData,
      students: updatedStudents,
    });
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const passwordStrength = getPasswordStrength(formData.password);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-2xl z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#175244]"></div>
              <p className="text-gray-700 font-medium">Przetwarzanie...</p>
            </div>
          </div>
        )}
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors z-10"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              {mode === "login" && "Zaloguj się"}
              {mode === "register" && "Utwórz konto"}
              {mode === "forgot-password" && "Resetuj hasło"}
            </h2>
            <p className="text-gray-600">
              {mode === "login" && "Wprowadź swoje dane logowania"}
              {mode === "register" && "Dołącz do nas już dziś!"}
              {mode === "forgot-password" && "Wyślemy Ci link do ustawienia nowego hasła"}
            </p>
          </div>

          {/* Login Form */}
          {mode === "login" && (
            <form onSubmit={handleLogin} className="space-y-6">
              {errors.form && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {errors.form}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all"
                  placeholder="twoj@email.pl"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Hasło
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 pr-10 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all"
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
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setMode("forgot-password");
                    setErrors({});
                  }}
                  className="text-sm text-[#175244] hover:underline font-medium"
                >
                  Zapomniałem hasła
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-full bg-[#ffc94a] px-6 py-3 text-[#3b2a10] font-semibold hover:bg-[#ffd76f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Logowanie..." : "Zaloguj się"}
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="w-full text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                ← Powrót
              </button>
            </form>
          )}

          {/* Forgot Password Form */}
          {mode === "forgot-password" && (
            <form onSubmit={handleForgotPassword} className="space-y-6">
              {errors.form && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {errors.form}
                </div>
              )}

              {forgotPasswordSuccess && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                  ✅ Jeśli konto z tym adresem email istnieje, wysłaliśmy link do resetowania hasła. Sprawdź swoją skrzynkę odbiorczą.
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all"
                  placeholder="twoj@email.pl"
                  required
                />
                <p className="mt-2 text-xs text-gray-500">
                  Wyślemy Ci link do ustawienia nowego hasła na ten adres email.
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-full bg-[#ffc94a] px-6 py-3 text-[#3b2a10] font-semibold hover:bg-[#ffd76f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Wysyłanie..." : "Wyślij link resetujący"}
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="w-full text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                ← Powrót
              </button>
            </form>
          )}

          {/* Register Form */}
          {mode === "register" && (
            <form onSubmit={handleRegister} className="space-y-6">
              {errors.form && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {errors.form}
                </div>
              )}

              {/* Parent Info - Imię i Nazwisko */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Imię (rodzica) *
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className={`w-full rounded-lg border ${errors.firstName ? 'border-red-300' : 'border-gray-300'} px-4 py-2.5 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all`}
                    placeholder="Jan"
                    required
                  />
                  {errors.firstName && <p className="mt-1 text-xs text-red-600">{errors.firstName}</p>}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Nazwisko (rodzica) *
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className={`w-full rounded-lg border ${errors.lastName ? 'border-red-300' : 'border-gray-300'} px-4 py-2.5 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all`}
                    placeholder="Kowalski"
                    required
                  />
                  {errors.lastName && <p className="mt-1 text-xs text-red-600">{errors.lastName}</p>}
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={`w-full rounded-lg border ${errors.email ? 'border-red-300' : 'border-gray-300'} px-4 py-2.5 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all`}
                  placeholder="twoj@email.pl"
                  required
                />
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Hasło *
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
                  Powtórz hasło *
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

              {/* Students Info */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Dane dziecka</h3>
                {formData.students.map((student, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-4">
                    {formData.students.length > 1 && (
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-700">Dziecko {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeStudent(index)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          Usuń
                        </button>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Imię dziecka *
                        </label>
                        <input
                          type="text"
                          value={student.firstName}
                          onChange={(e) => updateStudent(index, "firstName", e.target.value)}
                          className={`w-full rounded-lg border ${errors[`student_${index}_firstName`] ? 'border-red-300' : 'border-gray-300'} px-4 py-2.5 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all`}
                          placeholder="Ania"
                          required
                        />
                        {errors[`student_${index}_firstName`] && <p className="mt-1 text-xs text-red-600">{errors[`student_${index}_firstName`]}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Nazwisko dziecka *
                        </label>
                        <input
                          type="text"
                          value={student.lastName}
                          onChange={(e) => updateStudent(index, "lastName", e.target.value)}
                          className={`w-full rounded-lg border ${errors[`student_${index}_lastName`] ? 'border-red-300' : 'border-gray-300'} px-4 py-2.5 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all`}
                          placeholder="Kowalska"
                          required
                        />
                        {errors[`student_${index}_lastName`] && <p className="mt-1 text-xs text-red-600">{errors[`student_${index}_lastName`]}</p>}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Rok urodzenia *
                        </label>
                        <input
                          type="number"
                          value={student.birthYear}
                          onChange={(e) => updateStudent(index, "birthYear", e.target.value)}
                          className={`w-full rounded-lg border ${errors[`student_${index}_birthYear`] ? 'border-red-300' : 'border-gray-300'} px-4 py-2.5 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all`}
                          placeholder="2018"
                          min="2000"
                          max={new Date().getFullYear()}
                          required
                        />
                        {errors[`student_${index}_birthYear`] && <p className="mt-1 text-xs text-red-600">{errors[`student_${index}_birthYear`]}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Lokalizacja *
                        </label>
                        <select
                          value={student.location}
                          onChange={(e) => updateStudent(index, "location", e.target.value)}
                          className={`w-full rounded-lg border ${errors[`student_${index}_location`] ? 'border-red-300' : 'border-gray-300'} px-4 py-2.5 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all`}
                          required
                        >
                          <option value="">Wybierz lokalizację</option>
                          <option value="Paniówki">Paniówki</option>
                          <option value="Halemba">Halemba</option>
                          <option value="Orzegów">Orzegów</option>
                          <option value="Kochłowice">Kochłowice</option>
                          <option value="Bielszowice">Bielszowice</option>
                        </select>
                        {errors[`student_${index}_location`] && <p className="mt-1 text-xs text-red-600">{errors[`student_${index}_location`]}</p>}
                      </div>
                    </div>
                  </div>
                ))}
                
                <button
                  type="button"
                  onClick={addStudent}
                  className="w-full py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-[#175244] hover:text-[#175244] transition-colors font-medium"
                >
                  + Dodaj kolejne dziecko
                </button>
              </div>

              {/* RODO Consent */}
              <div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.rodoConsent}
                    onChange={(e) => setFormData({ ...formData, rodoConsent: e.target.checked })}
                    className="mt-1 w-4 h-4 text-[#175244] border-gray-300 rounded focus:ring-[#175244]"
                    required
                  />
                  <span className="text-sm text-gray-700">
                    Wyrażam zgodę na przetwarzanie moich danych osobowych zgodnie z{" "}
                    <a href="/rodo" target="_blank" className="text-[#175244] hover:underline font-medium">
                      polityką prywatności
                    </a>{" "}
                    w celu utworzenia konta i korzystania z usług Harry English. *
                  </span>
                </label>
                {errors.rodoConsent && <p className="mt-1 text-xs text-red-600">{errors.rodoConsent}</p>}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-full bg-[#ffc94a] px-6 py-3 text-[#3b2a10] font-semibold hover:bg-[#ffd76f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Tworzenie konta..." : "Utwórz konto"}
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="w-full text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                ← Powrót
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
