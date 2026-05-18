"use client";

import { useState } from "react";

interface ContactFormProps {
  isOpen: boolean;
  onClose: () => void;
}

const inputClass =
  "w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all";

export default function ContactForm({ isOpen, onClose }: ContactFormProps) {
  const [formData, setFormData] = useState({
    email: "",
    subject: "",
    childAge: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus("idle");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setSubmitStatus("success");
        setFormData({
          email: "",
          subject: "",
          childAge: "",
          message: "",
        });
        setTimeout(() => {
          onClose();
          setSubmitStatus("idle");
        }, 3000);
      } else {
        setSubmitStatus("error");
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      setSubmitStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className={`relative flex w-full max-w-md max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${
          isSubmitting ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        {isSubmitting && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
            <div className="flex flex-col items-center gap-3">
              <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#175244]" />
              <p className="font-medium text-gray-700">Wysyłanie...</p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 text-gray-400 transition-colors hover:text-gray-600"
          aria-label="Zamknij"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="p-8">
            <div className="mb-8 text-center">
              <h2 className="mb-2 text-3xl font-bold text-gray-900">Formularz kontaktowy</h2>
              <p className="text-gray-600">
                Napisz do nas — odpowiemy najszybciej, jak to możliwe
              </p>
            </div>

            {submitStatus === "success" ? (
              <div className="space-y-6 text-center">
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                  Wiadomość została wysłana pomyślnie! Odpowiemy najszybciej, jak to możliwe.
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-full bg-[#ffc94a] px-6 py-3 font-semibold text-[#3b2a10] transition-colors hover:bg-[#ffd76f]"
                >
                  Zamknij
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {submitStatus === "error" && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                    Wystąpił błąd. Spróbuj ponownie lub skontaktuj się telefonicznie.
                  </div>
                )}

                <div>
                  <label htmlFor="contact-email" className="mb-2 block text-sm font-semibold text-gray-700">
                    E-mail nadawcy *
                  </label>
                  <input
                    type="email"
                    id="contact-email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={inputClass}
                    placeholder="twoj@email.pl"
                  />
                </div>

                <div>
                  <label htmlFor="contact-subject" className="mb-2 block text-sm font-semibold text-gray-700">
                    Temat *
                  </label>
                  <select
                    id="contact-subject"
                    required
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Wybierz temat...</option>
                    <option value="zapisanie">Zapisanie dziecka na zajęcia</option>
                    <option value="lekcja">Lekcja pokazowa</option>
                    <option value="program">Pytanie odnośnie programu</option>
                    <option value="platnosci">Pytanie odnośnie płatności</option>
                    <option value="inne">Inne</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="contact-childAge" className="mb-2 block text-sm font-semibold text-gray-700">
                    Wiek dziecka
                  </label>
                  <input
                    type="text"
                    id="contact-childAge"
                    value={formData.childAge}
                    onChange={(e) => setFormData({ ...formData, childAge: e.target.value })}
                    className={inputClass}
                    placeholder="np. 5 lat"
                  />
                </div>

                <div>
                  <label htmlFor="contact-message" className="mb-2 block text-sm font-semibold text-gray-700">
                    Wiadomość *
                  </label>
                  <textarea
                    id="contact-message"
                    required
                    rows={6}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className={`${inputClass} resize-none`}
                    placeholder="Twoja wiadomość..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-full bg-[#ffc94a] px-6 py-3 font-semibold text-[#3b2a10] transition-colors hover:bg-[#ffd76f] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? "Wysyłanie..." : "Wyślij wiadomość"}
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full text-sm text-gray-600 transition-colors hover:text-gray-800"
                >
                  ← Anuluj
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
