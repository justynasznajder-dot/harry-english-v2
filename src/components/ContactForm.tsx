"use client";

import { useState } from "react";

interface ContactFormProps {
  isOpen: boolean;
  onClose: () => void;
}

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-[#FDFBF7] rounded-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#1a5c44] hover:text-[#144a37] text-2xl font-bold"
          aria-label="Zamknij"
        >
          ✕
        </button>

        <div className="p-8">
          <h2 className="text-3xl font-bold text-[#1a5c44] mb-6">
            Formularz kontaktowy
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-[#1a5c44] mb-2"
              >
                E-mail nadawcy *
              </label>
              <input
                type="email"
                id="email"
                required
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="w-full px-4 py-3 border-2 border-[#1a5c44]/20 rounded focus:border-[#1a5c44] focus:outline-none bg-white text-[#1a5c44]"
                placeholder="twoj@email.pl"
              />
            </div>

            {/* Subject */}
            <div>
              <label
                htmlFor="subject"
                className="block text-sm font-medium text-[#1a5c44] mb-2"
              >
                Temat *
              </label>
              <select
                id="subject"
                required
                value={formData.subject}
                onChange={(e) =>
                  setFormData({ ...formData, subject: e.target.value })
                }
                className="w-full px-4 py-3 border-2 border-[#1a5c44]/20 rounded focus:border-[#1a5c44] focus:outline-none bg-white text-[#1a5c44]"
              >
                <option value="">Wybierz temat...</option>
                <option value="zapisanie">Zapisanie dziecka na zajęcia</option>
                <option value="lekcja">Lekcja pokazowa</option>
                <option value="program">Pytanie odnośnie programu</option>
                <option value="platnosci">Pytanie odnośnie płatności</option>
                <option value="inne">Inne</option>
              </select>
            </div>

            {/* Child Age */}
            <div>
              <label
                htmlFor="childAge"
                className="block text-sm font-medium text-[#1a5c44] mb-2"
              >
                Wiek dziecka
              </label>
              <input
                type="text"
                id="childAge"
                value={formData.childAge}
                onChange={(e) =>
                  setFormData({ ...formData, childAge: e.target.value })
                }
                className="w-full px-4 py-3 border-2 border-[#1a5c44]/20 rounded focus:border-[#1a5c44] focus:outline-none bg-white text-[#1a5c44]"
                placeholder="np. 5 lat"
              />
            </div>

            {/* Message */}
            <div>
              <label
                htmlFor="message"
                className="block text-sm font-medium text-[#1a5c44] mb-2"
              >
                Wiadomość *
              </label>
              <textarea
                id="message"
                required
                rows={6}
                value={formData.message}
                onChange={(e) =>
                  setFormData({ ...formData, message: e.target.value })
                }
                className="w-full px-4 py-3 border-2 border-[#1a5c44]/20 rounded focus:border-[#1a5c44] focus:outline-none bg-white text-[#1a5c44] resize-none"
                placeholder="Twoja wiadomość..."
              />
            </div>

            {submitStatus === "success" && (
              <div className="p-4 bg-green-100 border border-green-400 text-green-700 rounded">
                Wiadomość została wysłana pomyślnie! Odpowiemy najszybciej jak to możliwe.
              </div>
            )}

            {submitStatus === "error" && (
              <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                Wystąpił błąd. Spróbuj ponownie lub skontaktuj się telefonicznie.
              </div>
            )}

            {/* Submit Button */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-8 py-4 bg-[#1a5c44] text-[#FDFBF7] text-sm font-medium hover:bg-[#144a37] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Wysyłanie..." : "Wyślij wiadomość"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-8 py-4 border-2 border-[#1a5c44] text-[#1a5c44] text-sm font-medium hover:bg-[#1a5c44] hover:text-[#FDFBF7] transition-all"
              >
                Anuluj
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
