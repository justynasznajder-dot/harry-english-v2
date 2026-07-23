"use client";

import { useState, useEffect } from "react";
import {
  DUPLICATE_CHILD_IN_FORM_MESSAGE,
  findDuplicateChildIndices,
} from "@/lib/enrollment-duplicate";
import { normalizePolishPhone } from "@/lib/phone";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "select" | "login" | "register" | "forgot-password";
}

export default function AuthModal({ isOpen, onClose, initialMode = "select" }: AuthModalProps) {
  const [mode, setMode] = useState<"select" | "login" | "register" | "forgot-password">(initialMode);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    phone: "",
    students: [
      {
        firstName: "",
        lastName: "",
        birthDate: "",
        preferredLocationId: "",
      },
    ],
    rodoConsent: false,
  });
  const [locations, setLocations] = useState<
    Array<{ id: string; name: string; is_featured?: boolean }>
  >([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false);
  const [existingAccountConfirm, setExistingAccountConfirm] = useState<{
    firstName: string;
    lastName: string;
  } | null>(null);
  const [confirmExistingAccount, setConfirmExistingAccount] = useState(false);

  useEffect(() => {
    if (!forgotPasswordSuccess) return;
    const timer = setTimeout(() => {
      setForgotPasswordSuccess(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [forgotPasswordSuccess]);

  // Resetuj tryb do initialMode gdy modal się otwiera
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setRegisterSuccess(false);
      setExistingAccountConfirm(null);
      setConfirmExistingAccount(false);
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    if (!isOpen || mode !== "register") return;
    let cancelled = false;
    setLocationsLoading(true);
    fetch("/api/public/locations")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { locations?: Array<{ id: string; name: string; is_featured?: boolean }> }) => {
        if (!cancelled) setLocations(Array.isArray(data.locations) ? data.locations : []);
      })
      .catch(() => {
        if (!cancelled) setLocations([]);
      })
      .finally(() => {
        if (!cancelled) setLocationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, mode]);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);

    try {
      // Defensywnie przycinamy białe znaki — klienty pocztowe (Gmail, Outlook)
      // często doklejają spację/nowy wiersz przy kopiowaniu hasła tymczasowego z maila,
      // przez co bcrypt.compare zwracał false i logowanie nie działało.
      const emailToSubmit = formData.email.trim();
      const passwordToSubmit = formData.password.trim();
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailToSubmit,
          password: passwordToSubmit,
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

        // Przy pierwszym logowaniu po wygenerowaniu konta przez admina — wymuś zmianę hasła.
        if (data.mustChangePassword || data.user?.mustChangePassword) {
          window.location.href = "/portal/zmien-haslo";
        } else {
          window.location.href = "/portal";
        }
      } else {
        setErrors({ form: data.message || "Nieprawidłowy email lub hasło" });
      }
    } catch (error) {
      setErrors({ form: "Wystąpił błąd. Spróbuj ponownie." });
    } finally {
      setIsLoading(false);
    }
  };

  const submitRegister = async (opts?: { confirmExistingAccount?: boolean }) => {
    setErrors({});

    const newErrors: Record<string, string> = {};

    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Podaj prawidłowy adres email";
    }

    if (!formData.firstName.trim()) {
      newErrors.firstName = "Pole wymagane";
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = "Pole wymagane";
    }

    const normalizedPhone = normalizePolishPhone(formData.phone);
    const phoneDigits = normalizedPhone.replace(/\D/g, "");
    if (!formData.phone.trim()) {
      newErrors.phone = "Pole wymagane";
    } else if (phoneDigits.length < 9) {
      newErrors.phone = "Podaj numer z co najmniej 9 cyframi";
    }

    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    formData.students.forEach((student, index) => {
      if (!student.firstName.trim()) {
        newErrors[`student_${index}_firstName`] = "Pole wymagane";
      }
      if (!student.lastName.trim()) {
        newErrors[`student_${index}_lastName`] = "Pole wymagane";
      }
      const bd = student.birthDate?.trim() ?? "";
      if (!bd || !isoDate.test(bd)) {
        newErrors[`student_${index}_birthDate`] = "Wybierz datę urodzenia (YYYY-MM-DD)";
      } else {
        const [y, m, d] = bd.split("-").map(Number);
        const parsed = new Date(y, m - 1, d);
        if (
          parsed.getFullYear() !== y ||
          parsed.getMonth() !== m - 1 ||
          parsed.getDate() !== d
        ) {
          newErrors[`student_${index}_birthDate`] = "Nieprawidłowa data";
        } else if (y < 2000) {
          newErrors[`student_${index}_birthDate`] = "Rok urodzenia nie może być wcześniejszy niż 2000";
        } else if (parsed > todayEnd) {
          newErrors[`student_${index}_birthDate`] = "Data nie może być w przyszłości";
        }
      }
      if (locations.length > 0 && !student.preferredLocationId?.trim()) {
        newErrors[`student_${index}_preferredLocationId`] = "Wybierz lokalizację";
      }
    });

    findDuplicateChildIndices(
      formData.students.map((student) => ({
        firstName: student.firstName,
        lastName: student.lastName,
        birthDate: student.birthDate,
      }))
    ).forEach((index) => {
      newErrors[`student_${index}_firstName`] = DUPLICATE_CHILD_IN_FORM_MESSAGE;
    });

    if (!formData.rodoConsent) {
      newErrors.rodoConsent = "Zgoda jest wymagana";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const withConfirm =
      opts?.confirmExistingAccount === true || confirmExistingAccount;

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: normalizedPhone,
          children: formData.students.map((s) => ({
            firstName: s.firstName.trim(),
            lastName: s.lastName.trim(),
            birthDate: s.birthDate.trim(),
            preferredLocationId: s.preferredLocationId.trim() || undefined,
          })),
          rodoConsent: formData.rodoConsent,
          confirmExistingAccount: withConfirm || undefined,
        }),
      });

      const data = (await response.json()) as {
        message?: string;
        code?: string;
        existingAccount?: { firstName?: string; lastName?: string };
      };

      if (response.ok) {
        setExistingAccountConfirm(null);
        setConfirmExistingAccount(false);
        setRegisterSuccess(true);
        return;
      }

      if (
        response.status === 409 &&
        data.code === "EXISTING_ACCOUNT_CONFIRMATION_REQUIRED" &&
        data.existingAccount
      ) {
        setExistingAccountConfirm({
          firstName: String(data.existingAccount.firstName ?? "").trim(),
          lastName: String(data.existingAccount.lastName ?? "").trim(),
        });
        setConfirmExistingAccount(false);
        return;
      }

      setErrors({ form: data.message || "Nie udało się wysłać zgłoszenia" });
    } catch {
      setErrors({ form: "Wystąpił błąd. Spróbuj ponownie." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitRegister();
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
        body: JSON.stringify({ email: formData.email.trim() }),
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
      firstName: "",
      lastName: "",
      phone: "",
      students: [
        {
          firstName: "",
          lastName: "",
          birthDate: "",
          preferredLocationId: "",
        },
      ],
      rodoConsent: false,
    });
    setErrors({});
    setForgotPasswordSuccess(false);
    setRegisterSuccess(false);
  };

  const addStudent = () => {
    setFormData({
      ...formData,
      students: [
        ...formData.students,
        {
          firstName: "",
          lastName: "",
          birthDate: "",
          preferredLocationId: "",
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className={`relative flex w-full max-w-md max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${isLoading ? "opacity-50 pointer-events-none" : ""}`}
      >
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              {mode === "login" && "Zaloguj się"}
              {mode === "register" && "Zgłoszenie dziecka"}
              {mode === "forgot-password" && "Resetuj hasło"}
            </h2>
            {!(mode === "register" && registerSuccess) && (
              <p className="text-gray-600">
                {mode === "login" && "Wprowadź swoje dane logowania"}
                {mode === "register" &&
                  "Wypełnij formularz — odezwiemy się do Ciebie żeby ustalić szczegóły"}
                {mode === "forgot-password" && "Wyślemy Ci link do ustawienia nowego hasła"}
              </p>
            )}
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

          {/* Register Form — zgłoszenie bez zakładania konta */}
          {mode === "register" && registerSuccess && (
            <div className="space-y-6 text-center">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
                Dziękujemy! Zgłoszenie zostało zapisane. Wkrótce skontaktujemy się z Tobą e-mailem lub
                telefonicznie.
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="w-full rounded-full bg-[#ffc94a] px-6 py-3 text-[#3b2a10] font-semibold hover:bg-[#ffd76f] transition-colors"
              >
                Zamknij
              </button>
            </div>
          )}
          {mode === "register" && !registerSuccess && (
            <form onSubmit={handleRegister} className="space-y-6">
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
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    setExistingAccountConfirm(null);
                    setConfirmExistingAccount(false);
                  }}
                  className={`w-full rounded-lg border ${errors.email ? 'border-red-300' : 'border-gray-300'} px-4 py-2.5 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all`}
                  placeholder="twoj@email.pl"
                  required
                />
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Telefon (rodzica) *
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: normalizePolishPhone(e.target.value) })
                  }
                  onBlur={(e) =>
                    setFormData({ ...formData, phone: normalizePolishPhone(e.target.value) })
                  }
                  className={`w-full rounded-lg border ${errors.phone ? "border-red-300" : "border-gray-300"} px-4 py-2.5 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all`}
                  placeholder="+48 600 000 000"
                  required
                />
                {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
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

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Data urodzenia * <span className="font-normal text-gray-500">(YYYY-MM-DD)</span>
                      </label>
                      <input
                        type="date"
                        value={student.birthDate}
                        onChange={(e) => updateStudent(index, "birthDate", e.target.value)}
                        max={new Date().toISOString().slice(0, 10)}
                        min="2000-01-01"
                        className={`w-full rounded-lg border ${errors[`student_${index}_birthDate`] ? 'border-red-300' : 'border-gray-300'} px-4 py-2.5 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all`}
                        required
                      />
                      {errors[`student_${index}_birthDate`] && (
                        <p className="mt-1 text-xs text-red-600">{errors[`student_${index}_birthDate`]}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Preferowana lokalizacja *
                      </label>
                      <select
                        value={student.preferredLocationId}
                        onChange={(e) => updateStudent(index, "preferredLocationId", e.target.value)}
                        disabled={locationsLoading || locations.length === 0}
                        className={`w-full rounded-lg border ${
                          errors[`student_${index}_preferredLocationId`]
                            ? "border-red-300"
                            : "border-gray-300"
                        } px-4 py-2.5 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all disabled:bg-gray-100 disabled:text-gray-500`}
                        required={locations.length > 0}
                      >
                        <option value="">
                          {locationsLoading
                            ? "Ładowanie lokalizacji…"
                            : locations.length === 0
                              ? "Brak lokalizacji — skontaktuj się ze szkołą"
                              : "— Wybierz —"}
                        </option>
                        {locations.map((loc) => (
                          <option
                            key={loc.id}
                            value={loc.id}
                            style={
                              loc.is_featured
                                ? { fontWeight: 700, color: "#0f6e56" }
                                : undefined
                            }
                          >
                            {loc.is_featured ? `★ ${loc.name}` : loc.name}
                          </option>
                        ))}
                      </select>
                      {errors[`student_${index}_preferredLocationId`] && (
                        <p className="mt-1 text-xs text-red-600">
                          {errors[`student_${index}_preferredLocationId`]}
                        </p>
                      )}
                      {!locationsLoading && locations.length === 0 && (
                        <p className="mt-1 text-xs text-amber-700">
                          Nie udało się wczytać listy placówek. Odśwież stronę lub skontaktuj się z biurem.
                        </p>
                      )}
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
                    Wyrażam zgodę na przetwarzanie moich danych osobowych oraz danych dziecka zgodnie z{" "}
                    <a href="/rodo" target="_blank" className="text-[#175244] hover:underline font-medium">
                      polityką prywatności
                    </a>
                    , w zakresie niezbędnym do rozpatrzenia zgłoszenia na zajęcia Harry English. *
                  </span>
                </label>
                {errors.rodoConsent && <p className="mt-1 text-xs text-red-600">{errors.rodoConsent}</p>}
              </div>

              {errors.form && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {errors.form}
                </div>
              )}

              {existingAccountConfirm && (
                <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                  <p>
                    Na ten email jest już konto{" "}
                    <strong>
                      {`${existingAccountConfirm.firstName} ${existingAccountConfirm.lastName}`.trim()}
                    </strong>
                    . Kontynuować? Zgłoszenie będzie powiązane z tym kontem.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => {
                        setExistingAccountConfirm(null);
                        setConfirmExistingAccount(false);
                      }}
                      className="w-full rounded-full border border-amber-400 bg-white px-4 py-2.5 font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                    >
                      Anuluj
                    </button>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => {
                        setConfirmExistingAccount(true);
                        void submitRegister({ confirmExistingAccount: true });
                      }}
                      className="w-full rounded-full bg-[#ffc94a] px-4 py-2.5 font-semibold text-[#3b2a10] hover:bg-[#ffd76f] disabled:opacity-50"
                    >
                      {isLoading ? "Wysyłanie..." : "Kontynuuj zgłoszenie"}
                    </button>
                  </div>
                </div>
              )}

              {!existingAccountConfirm && (
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full rounded-full bg-[#ffc94a] px-6 py-3 text-[#3b2a10] font-semibold hover:bg-[#ffd76f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? "Wysyłanie..." : "Zgłoszenie dziecka"}
                </button>
              )}

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
    </div>
  );
}
