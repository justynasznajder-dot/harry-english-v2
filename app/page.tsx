"use client";

import { useState, useEffect } from "react";
import ReloadableImage from "../src/components/ReloadableImage";
import ContactForm from "../src/components/ContactForm";
import AuthModal from "../src/components/AuthModal";
import {
  usePublicSiteContent,
  type PublicSiteContent,
} from "../src/hooks/usePublicSiteContent";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function TestimonialCard({
  t,
  idx,
}: {
  t: PublicSiteContent["testimonials"][number];
  idx: number;
}) {
  const colors = ["bg-[#175244]", "bg-purple-600", "bg-blue-600", "bg-gray-500"];
  const bg = colors[idx % colors.length];
  const initial = (t.author_name?.trim()?.[0] ?? "?").toUpperCase();
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-start gap-4">
        <div
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${bg} text-lg font-bold text-white`}
        >
          {initial}
        </div>
        <div className="flex-1">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-[#202124]">{t.author_name}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xs text-[#5f6368]">Opinia z:</span>
                <GoogleIcon className="h-4 w-4" />
                <span className="text-xs font-medium text-[#5f6368]">Google</span>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1 text-sm text-[#5f6368]">
                <span>{t.rating}</span>
                <span className="text-gray-400">/</span>
                <span>5</span>
              </div>
              {t.sort_label ? (
                <div className="mt-1 text-xs text-[#5f6368]">{t.sort_label}</div>
              ) : null}
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[#202124]">{t.body}</p>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"select" | "login" | "register" | "forgot-password">("select");
  const [selectedPlan, setSelectedPlan] = useState<"walk" | "run" | "swim" | "fly" | null>(null);
  const [allReviewsOpen, setAllReviewsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [galleryZoomSrc, setGalleryZoomSrc] = useState<string | null>(null);
  const [minorProtectionOpen, setMinorProtectionOpen] = useState(false);
  const { data: siteContent, loading: siteContentLoading } = usePublicSiteContent();

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setGalleryZoomSrc(null);
        setMinorProtectionOpen(false);
        setAllReviewsOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  useEffect(() => {
    let prev = window.scrollY > 80;
    const handleScroll = () => {
      const y = window.scrollY;
      const next = prev ? y > 25 : y > 80;
      if (next !== prev) {
        prev = next;
        setIsScrolled(next);
      }
    };
    setIsScrolled(prev);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#0f3c33] text-slate-900">
      <div
        className="min-h-screen"
        style={{
          background:
            "radial-gradient(circle at top left, #256f5a 0, #0f3c33 45%, #0b2d26 100%)",
        }}
      >
        {/* STICKY HEADER */}
        <div className="sticky top-0 z-40">
          <div className="mx-auto max-w-6xl px-4 lg:px-6">
            <header className="rounded-b-3xl overflow-hidden border border-[#05231d] bg-gradient-to-b from-[#073229] to-[#0f3c33] shadow-[0_10px_25px_rgba(0,0,0,0.35)]">
              {/* LOGO U GÓRY – centrowane, zmniejsza się przy scrollu */}
              <div className={`flex items-center justify-center px-4 border-b border-white/10 transition-[padding] duration-300 ease-out ${
                isScrolled ? "py-1 lg:py-2" : "py-3 lg:py-4"
              }`}>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setMobileOpen(false);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffc94a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#073229] rounded"
                >
                  <ReloadableImage
                    src="/images/harry_english_napis.png"
                    alt="Harry English logo"
                    width={220}
                    height={120}
                    priority
                    className={`w-auto object-contain transition-[max-height] duration-300 ease-out ${
                      isScrolled ? "max-h-[36px] lg:max-h-[40px]" : "max-h-[72px] lg:max-h-[80px]"
                    }`}
                  />
                </a>
              </div>

              {/* MENU PONIŻEJ */}
              <div className="flex items-center justify-end lg:justify-between px-4 py-3 lg:px-6 lg:py-4">
                {/* MENU DESKTOP */}
                <nav className="hidden items-center gap-8 text-sm font-medium text-[#fdfaf3] lg:flex flex-1 justify-center">
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="transition-colors hover:text-[#ffc94a]"
                  >
                    Strona główna
                  </a>
                  <a href="#about" className="transition-colors hover:text-[#ffc94a]">
                    O nas
                  </a>
                  <a href="#teachers" className="transition-colors hover:text-[#ffc94a]">
                    Nasze lektorki
                  </a>
                  <a href="#offer" className="transition-colors hover:text-[#ffc94a]">
                    Oferta
                  </a>
                  <a href="#gallery" className="transition-colors hover:text-[#ffc94a]">
                    Galeria
                  </a>
                  <a href="#contact" className="transition-colors hover:text-[#ffc94a]">
                    Kontakt
                  </a>
                  <button
                    type="button"
                    onClick={() => setMinorProtectionOpen(true)}
                    className="transition-colors hover:text-[#ffc94a]"
                  >
                    Ochrona małoletnich
                  </button>
                  <button
                    onClick={() => {
                      setAuthModalMode("login");
                      setAuthModalOpen(true);
                    }}
                    className="transition-colors hover:text-[#ffc94a]"
                  >
                    Zaloguj
                  </button>

                  <button
                    onClick={() => {
                      setAuthModalMode("register");
                      setAuthModalOpen(true);
                    }}
                    className="rounded-full bg-[#ffc94a] px-5 py-2 text-xs font-semibold text-[#3b2a10] shadow-md shadow-black/20 transition-colors hover:bg-[#ffd76f]"
                  >
                    Zapisz dziecko
                  </button>
                </nav>

                {/* HAMBURGER (MOBILE/TABLET) */}
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-xl border border-white/20 px-3 py-2 text-[#fdfaf3] transition-colors hover:border-[#ffc94a] hover:text-[#ffc94a] lg:hidden"
                  aria-label={mobileOpen ? "Zamknij menu" : "Otwórz menu"}
                  aria-expanded={mobileOpen}
                  onClick={() => setMobileOpen((v) => !v)}
                >
                  <span className="text-lg leading-none">
                    {mobileOpen ? "✕" : "☰"}
                  </span>
                </button>
              </div>

              {/* MENU MOBILE */}
              {mobileOpen && (
                <div className="border-t border-white/10 bg-gradient-to-b from-[#073229] to-[#0f3c33] px-4 pb-4 lg:hidden">
                  <nav className="mt-3 flex flex-col gap-2 text-sm font-medium text-[#fdfaf3]">
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setMobileOpen(false);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="rounded-xl px-3 py-2 transition-colors hover:bg-white/10"
                    >
                      Strona główna
                    </a>
                    <a
                      href="#about"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-xl px-3 py-2 transition-colors hover:bg-white/10"
                    >
                      O nas
                    </a>
                    <a
                      href="#teachers"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-xl px-3 py-2 transition-colors hover:bg-white/10"
                    >
                      Nasze lektorki
                    </a>
                    <a
                      href="#offer"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-xl px-3 py-2 transition-colors hover:bg-white/10"
                    >
                      Oferta
                    </a>
                    <a
                      href="#gallery"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-xl px-3 py-2 transition-colors hover:bg-white/10"
                    >
                      Galeria
                    </a>
                    <a
                      href="#contact"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-xl px-3 py-2 transition-colors hover:bg-white/10"
                    >
                      Kontakt
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileOpen(false);
                        setMinorProtectionOpen(true);
                      }}
                      className="rounded-xl px-3 py-2 transition-colors hover:bg-white/10 w-full text-left"
                    >
                      Ochrona małoletnich
                    </button>
                    <button
                      onClick={() => {
                        setMobileOpen(false);
                        setAuthModalMode("login");
                        setAuthModalOpen(true);
                      }}
                      className="rounded-xl px-3 py-2 transition-colors hover:bg-white/10 w-full text-left"
                    >
                      Zaloguj
                    </button>

                    <button
                      onClick={() => {
                        setMobileOpen(false);
                        setAuthModalMode("register");
                        setAuthModalOpen(true);
                      }}
                      className="mt-2 inline-flex justify-center rounded-full bg-[#ffc94a] px-6 py-3 text-xs font-semibold text-[#3b2a10] shadow-md shadow-black/20 transition-colors hover:bg-[#ffd76f]"
                    >
                      Zapisz dziecko
                    </button>
                  </nav>
                </div>
              )}
            </header>
          </div>
        </div>

        {/* GŁÓWNY CONTAINER */}
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-1 lg:px-6">
          {/* HERO */}
          <section
            id="hero"
            className="mt-2 grid gap-12 rounded-3xl bg-gradient-to-r from-[#175244] via-[#186653] to-[#0f3c33] px-6 py-12 text-[#fdfaf3] shadow-2xl shadow-black/30 scroll-mt-6 pt-8 md:pt-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14 lg:px-10 lg:py-16 lg:pt-14"
          >
            {/* ŻYRAFA + ILUSTRACJA */}
            <div className="relative flex items-center justify-center">
              <div className="relative z-10 -translate-x-8 scale-90 sm:scale-100 md:-translate-x-12 md:scale-125">
                <div className="relative h-[300px] w-[300px] sm:h-[350px] sm:w-[350px] md:h-[400px] md:w-[400px]">
                  <ReloadableImage
                    src="/images/2zyrafa2.svg"
                    alt="Żyrafa Harry"
                    fill
                    className="object-contain"
                  />
                </div>
              </div>

              <div className="pointer-events-none absolute inset-0">
                <div
                  className="h-full w-full opacity-40"
                  style={{
                   // backgroundImage: "url('/images/giraffe-line-bg.svg')",
                    backgroundRepeat: "no-repeat",
                    backgroundSize: "80% auto",
                    backgroundPosition: "right bottom",
                  }}
                />
              </div>
            </div>

            {/* TEKST HERO */}
            <div className="relative z-10 flex flex-col justify-center gap-6">
              <div>
                <h1 className="mt-2 text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">
                  Harry English angielski z pasją
                </h1>
                <p className="mt-4 max-w-xl text-sm text-[#fdfaf3]/90 sm:text-base">
                  Oferujemy zajęcia nauczania języka angielskiego prowadzone przez profesjonalną, doświadczoną kadrę lektorską. Nauka odbywa się w oparciu o autorski program, który angażuje wszystkie zmysły ucznia, wspierając naturalne przyswajanie języka. Zajęcia mają formę zabawy – pełne ruchu, muzyki, gier i kreatywnych aktywności – dzięki czemu dzieci uczą się w atmosferze radości, swobody i motywacji.
                  <br />
                  <br />
                  Harry English to ponad 10 lat doświadczenia. Nasze zaangażowanie, upływ czasu i Wasze zadowolenie sprawiły, że dziś Harry to nie tylko angielski dla dzieci, ale również zajęcia indywidualne dla młodzieży i dorosłych. Bo nauka języka może być przyjemnością – niezależnie od wieku.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <a
                  href="#cta"
                  className="rounded-full bg-[#ffc94a] px-7 py-3 text-sm font-semibold text-[#3b2a10] shadow-lg shadow-black/25 transition-colors hover:bg-[#ffd76f]"
                >
                  Umów bezpłatną lekcję
                </a>
                <a
                  href="tel:+48697403020"
                  className="text-sm font-medium text-[#ffeab2] transition-colors hover:text-[#ffffff]"
                >
                  +48 697 40 30 20
                </a>
              </div>
            </div>
          </section>

          {/* SEKCJA: DLACZEGO MY — zdjęcia z bazy (marketing_gallery), max 3 */}
          <section
            id="about"
            className="mt-12 rounded-3xl bg-[#f8f6f3] px-6 py-10 shadow-xl shadow-black/20 scroll-mt-32 lg:px-10"
          >
            <div className="text-center">
              <h2 className="text-2xl font-bold text-[#1f2933]">Dlaczego my?</h2>
              <p className="mt-2 text-sm text-[#4b5563]">
                Sensowne zajęcia do których nie trzeba nikogo zmuszać
              </p>
            </div>

            {siteContentLoading ? (
              <div className="mt-8 grid gap-6 md:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-64 animate-pulse rounded-2xl bg-gray-200/80" />
                ))}
              </div>
            ) : (siteContent?.gallery ?? []).length === 0 ? (
              <p className="mt-8 text-center text-sm text-[#5f6368]">Brak danych.</p>
            ) : (
              <div className="mt-8 grid gap-6 md:grid-cols-3">
                {(siteContent?.gallery ?? []).slice(0, 3).map((item, idx) => (
                  <div
                    key={`${item.image_path}-${idx}`}
                    className="overflow-hidden rounded-2xl bg-white px-6 pb-6 shadow-md"
                  >
                    <div className="mb-2 h-40 w-full overflow-hidden rounded-t-xl bg-gray-300/60">
                      <button
                        type="button"
                        onClick={() => setGalleryZoomSrc(item.image_path)}
                        className="group relative h-full w-full cursor-pointer text-left transition-transform hover:scale-105"
                        aria-label="Powiększ zdjęcie"
                      >
                        <ReloadableImage
                          src={item.image_path}
                          alt={item.caption ?? "Zdjęcie z zajęć"}
                          fill
                          className="object-contain"
                        />
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#175244]/0 transition-colors group-hover:bg-[#175244]/20">
                          <span className="text-2xl text-white opacity-0 transition-opacity group-hover:opacity-100">
                            🔍
                          </span>
                        </div>
                      </button>
                    </div>
                    {item.caption ? (
                      <h3 className="text-center text-base font-semibold text-[#1f2933]">
                        {item.caption}
                      </h3>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* SEKCJA: CENNIK - NOWY STYL Z KARTAMI */}
          <section
            id="offer"
            className="mt-12 rounded-3xl bg-[#f8f6f3] px-4 py-6 shadow-xl shadow-black/20 scroll-mt-32 sm:px-6 sm:py-8 lg:px-10 lg:py-10"
          >
            <div className="text-center mb-6 sm:mb-8 lg:mb-10">
              <h2 className="text-xl font-bold text-[#1f2933] sm:text-2xl">
                Język angielski dla dzieci, młodzieży i dorosłych
              </h2>
              <p className="mt-1.5 text-sm text-[#4b5563] sm:mt-2">
                Przejrzysta oferta zajęć – dobierz wariant do wieku i potrzeb.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6 max-w-6xl mx-auto">
              {/* Let's walk */}
              <div className="rounded-2xl bg-white p-4 shadow-lg hover:shadow-xl transition-all flex flex-col sm:rounded-3xl sm:p-5">
                <div className="text-center mb-3 sm:mb-4">
                  <div className="inline-block bg-[#eef6f3] px-3 py-0.5 rounded-full text-xs font-semibold text-[#145a46] mb-1.5 sm:mb-2 sm:px-4 sm:py-1 uppercase tracking-wide">
                    Przedszkolaki
                  </div>
                  <h3 className="text-xl font-bold text-[#1f2933] mb-0.5 sm:text-2xl sm:mb-1">Let's walk</h3>
                  <p className="text-xs text-[#4b5563] sm:text-sm">3-6 lat</p>
                </div>

                <div className="mb-3 border-y border-gray-200 py-3 text-center sm:mb-4 sm:py-4">
                  <p className="text-sm font-medium text-[#1f2933]">Cennik w biurze</p>
                  <p className="mt-1 text-xs text-[#4b5563] sm:text-sm">
                    Aktualne stawki ustalamy indywidualnie.
                  </p>
                </div>

                <div className="space-y-1 mb-3 sm:space-y-1.5 sm:mb-4">
                  <div className="flex items-start gap-1.5 text-xs sm:gap-2 sm:text-sm">
                    <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                    <span className="text-[#4b5563]">40 minut zajęć</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-xs sm:gap-2 sm:text-sm">
                    <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                    <span className="text-[#4b5563]">Małe grupy (max 8 dzieci)</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-xs sm:gap-2 sm:text-sm">
                    <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                    <span className="text-[#4b5563]">Nauka przez zabawę</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-xs sm:gap-2 sm:text-sm">
                    <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                    <span className="text-[#4b5563]">1-2x w tygodniu</span>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedPlan("walk")}
                  className="block w-full text-center rounded-full bg-[#175244] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0f3c33] transition-colors mt-auto sm:px-6 sm:py-3 sm:text-sm"
                >
                  Szczegóły planu
                </button>
              </div>

              {/* Let's run */}
              <div className="rounded-2xl bg-white p-4 shadow-lg hover:shadow-xl transition-all flex flex-col sm:rounded-3xl sm:p-5">
                <div className="text-center mb-3 sm:mb-4">
                  <div className="inline-block bg-[#eef6f3] px-3 py-0.5 rounded-full text-xs font-semibold text-[#145a46] mb-1.5 sm:mb-2 sm:px-4 sm:py-1 uppercase tracking-wide">
                    Klasy 1-3
                  </div>
                  <h3 className="text-xl font-bold text-[#1f2933] mb-0.5 sm:text-2xl sm:mb-1">Let's run</h3>
                  <p className="text-xs text-[#4b5563] sm:text-sm">7-9 lat</p>
                </div>

                <div className="mb-3 border-y border-gray-200 py-3 text-center sm:mb-4 sm:py-4">
                  <p className="text-sm font-medium text-[#1f2933]">Cennik w biurze</p>
                  <p className="mt-1 text-xs text-[#4b5563] sm:text-sm">
                    Aktualne stawki ustalamy indywidualnie.
                  </p>
                </div>

                <div className="space-y-1 mb-3 sm:space-y-1.5 sm:mb-4">
                  <div className="flex items-start gap-1.5 text-xs sm:gap-2 sm:text-sm">
                    <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                    <span className="text-[#4b5563]">45 minut zajęć</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-xs sm:gap-2 sm:text-sm">
                    <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                    <span className="text-[#4b5563]">Małe grupy (max 8 dzieci)</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-xs sm:gap-2 sm:text-sm">
                    <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                    <span className="text-[#4b5563]">Gramatyka + konwersacje</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-xs sm:gap-2 sm:text-sm">
                    <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                    <span className="text-[#4b5563]">1-2x w tygodniu</span>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedPlan("run")}
                  className="block w-full text-center rounded-full bg-[#175244] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0f3c33] transition-colors mt-auto sm:px-6 sm:py-3 sm:text-sm"
                >
                  Szczegóły planu
                </button>
              </div>

              {/* Let's swim */}
              <div className="rounded-2xl bg-white p-4 shadow-lg hover:shadow-xl transition-all flex flex-col sm:rounded-3xl sm:p-5">
                <div className="text-center mb-3 sm:mb-4">
                  <div className="inline-block bg-[#eef6f3] px-3 py-0.5 rounded-full text-xs font-semibold text-[#145a46] mb-1.5 sm:mb-2 sm:px-4 sm:py-1 uppercase tracking-wide">
                    Klasy 4+
                  </div>
                  <h3 className="text-xl font-bold text-[#1f2933] mb-0.5 sm:text-2xl sm:mb-1">Let's swim</h3>
                  <p className="text-xs text-[#4b5563] sm:text-sm">10+ lat</p>
                </div>

                <div className="mb-3 border-y border-gray-200 py-3 text-center sm:mb-4 sm:py-4">
                  <p className="text-sm font-medium text-[#1f2933]">Cennik w biurze</p>
                  <p className="mt-1 text-xs text-[#4b5563] sm:text-sm">
                    Aktualne stawki ustalamy indywidualnie.
                  </p>
                </div>

                <div className="space-y-1 mb-3 sm:space-y-1.5 sm:mb-4">
                  <div className="flex items-start gap-1.5 text-xs sm:gap-2 sm:text-sm">
                    <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                    <span className="text-[#4b5563]">50 minut zajęć</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-xs sm:gap-2 sm:text-sm">
                    <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                    <span className="text-[#4b5563]">Małe grupy (max 8 osób)</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-xs sm:gap-2 sm:text-sm">
                    <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                    <span className="text-[#4b5563]">Przygotowanie do egzaminów</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-xs sm:gap-2 sm:text-sm">
                    <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                    <span className="text-[#4b5563]">1-2x w tygodniu</span>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedPlan("swim")}
                  className="block w-full text-center rounded-full bg-[#175244] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0f3c33] transition-colors mt-auto sm:px-6 sm:py-3 sm:text-sm"
                >
                  Szczegóły planu
                </button>
              </div>

              {/* Let's fly */}
              <div className="rounded-2xl bg-white p-4 shadow-lg hover:shadow-xl transition-all flex flex-col sm:rounded-3xl sm:p-5">
                <div className="text-center mb-3 sm:mb-4">
                  <div className="inline-block bg-[#eef6f3] px-3 py-0.5 rounded-full text-xs font-semibold text-[#145a46] mb-1.5 sm:mb-2 sm:px-4 sm:py-1 uppercase tracking-wide">
                    Indywidualnie
                  </div>
                  <h3 className="text-xl font-bold text-[#1f2933] mb-0.5 sm:text-2xl sm:mb-1">Let's fly</h3>
                  <p className="text-xs text-[#4b5563] sm:text-sm">Wszystkie grupy wiekowe</p>
                </div>

                <div className="mb-3 border-y border-gray-200 py-3 text-center sm:mb-4 sm:py-4">
                  <p className="text-sm font-medium text-[#1f2933]">Cennik w biurze</p>
                  <p className="mt-1 text-xs text-[#4b5563] sm:text-sm">
                    Aktualne stawki ustalamy indywidualnie.
                  </p>
                </div>

                <div className="space-y-1 mb-3 sm:space-y-1.5 sm:mb-4">
                  <div className="flex items-start gap-1.5 text-xs sm:gap-2 sm:text-sm">
                    <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                    <span className="text-[#4b5563]">60 minut zajęć</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-xs sm:gap-2 sm:text-sm">
                    <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                    <span className="text-[#4b5563]">Lekcje 1 na 1</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-xs sm:gap-2 sm:text-sm">
                    <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                    <span className="text-[#4b5563]">Dostosowany program</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-xs sm:gap-2 sm:text-sm">
                    <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                    <span className="text-[#4b5563]">Elastyczne godziny</span>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedPlan("fly")}
                  className="block w-full text-center rounded-full bg-[#175244] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0f3c33] transition-colors mt-auto sm:px-6 sm:py-3 sm:text-sm"
                >
                  Szczegóły planu
                </button>
              </div>
            </div>
          </section>

          {/* REALNE ZAJĘCIA */}
          <section
            id="gallery"
            className="mt-12 rounded-3xl bg-[#f8f6f3] px-6 py-10 shadow-xl shadow-black/20 scroll-mt-32 lg:px-10"
          >
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-[#1f2933]">
                  Realne zajęcia – tak uczymy!
                </h2>
                <p className="mt-3 text-sm text-[#4b5563]">
                  Ciepła atmosfera, dużo ruchu i rozmowy. Dzieci czują się
                  swobodnie, a dorośli widzą realne postępy.
                </p>
                <ul className="mt-4 space-y-2 text-sm text-[#4b5563]">
                  <li>• małe grupy dostosowane poziomem</li>
                  <li>• materiały dopasowane do wieku i zainteresowań</li>
                  <li>• nacisk na mówienie, nie tylko na wypełnianie ćwiczeń</li>
                </ul>
              </div>

              <div className="grid flex-1 gap-3 md:grid-cols-2">
                {siteContentLoading ? (
                  [1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="aspect-[4/3] min-h-[10rem] animate-pulse rounded-2xl bg-gray-200/90 md:min-h-0 md:h-40"
                    />
                  ))
                ) : (siteContent?.gallery ?? []).length === 0 ? (
                  <p className="col-span-full text-sm text-[#5f6368]">Brak danych.</p>
                ) : (
                  (siteContent?.gallery ?? []).map((item, idx) => (
                    <button
                      key={`${item.image_path}-${idx}`}
                      type="button"
                      onClick={() => setGalleryZoomSrc(item.image_path)}
                      className="group relative aspect-[4/3] min-h-[10rem] w-full cursor-pointer overflow-hidden rounded-2xl bg-gray-300/60 text-left transition-transform hover:scale-105 md:min-h-0 md:h-40"
                    >
                      <ReloadableImage
                        src={item.image_path}
                        alt={item.caption ?? "Zdjęcie z zajęć"}
                        fill
                        className="object-contain md:object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-[#175244]/0 transition-colors group-hover:bg-[#175244]/20">
                        <span className="text-2xl text-white opacity-0 transition-opacity group-hover:opacity-100">
                          🔍
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* NASZE LEKTORKI */}
          <section
            id="teachers"
            className="mt-12 rounded-3xl bg-[#f8f6f3] px-6 py-10 shadow-xl shadow-black/20 scroll-mt-32 lg:px-10"
          >
            <div className="text-center">
              <h2 className="text-2xl font-bold text-[#1f2933]">
                Nasze lektorki
              </h2>
              <p className="mt-2 text-sm text-[#4b5563]">
                Doświadczone, empatyczne i zaangażowane w pracę z dziećmi i
                dorosłymi.
              </p>
            </div>

            {siteContentLoading ? (
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-56 animate-pulse rounded-2xl bg-gray-200/80" />
                ))}
              </div>
            ) : (siteContent?.teachers ?? []).length === 0 ? (
              <p className="mt-8 text-center text-sm text-[#5f6368]">Brak danych.</p>
            ) : (
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {(siteContent?.teachers ?? []).map((teacher) => (
                  <div
                    key={teacher.id}
                    className="flex flex-col items-center rounded-2xl bg-white p-5 text-center shadow-md transition-shadow hover:shadow-lg"
                  >
                    <div className="mb-4 flex h-[200px] w-[160px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#175244]/10">
                      <span className="text-3xl font-bold text-[#175244]">
                        {(teacher.first_name?.[0] ?? "?").toUpperCase()}
                        {(teacher.last_name?.[0] ?? "").toUpperCase()}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-[#1f2933]">
                      {teacher.first_name} {teacher.last_name}
                    </h3>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* OPINIE — marketing_testimonial */}
          <section className="mt-12 rounded-3xl bg-white px-6 py-10 shadow-xl shadow-black/20 lg:px-10">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold text-[#1f2933]">Opinie</h2>
            </div>
            {siteContentLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-100" />
                ))}
              </div>
            ) : (siteContent?.testimonials ?? []).length === 0 ? (
              <p className="text-center text-sm text-[#5f6368]">Brak danych.</p>
            ) : (
              <>
                <div className="space-y-4">
                  {(siteContent?.testimonials ?? []).slice(0, 3).map((t, idx) => (
                    <TestimonialCard key={`${t.author_name}-${idx}`} t={t} idx={idx} />
                  ))}
                </div>
                {(siteContent?.testimonials ?? []).length > 3 ? (
                  <div className="mt-8 text-center">
                    <button
                      type="button"
                      onClick={() => setAllReviewsOpen(true)}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-[#1a73e8] hover:underline"
                    >
                      Zobacz wszystkie opinie
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </section>

          {/* FAQ */}
          <section className="mt-12 rounded-3xl bg-[#f8f6f3] px-6 py-10 shadow-xl shadow-black/20 lg:px-10">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-[#1f2933]">
                Najczęściej zadawane pytania
              </h2>
              <p className="mt-2 text-sm text-[#5f6368]">
                Odpowiedzi na pytania, które nurtują rodziców
              </p>
            </div>

            <div className="mx-auto max-w-3xl space-y-3">
              {siteContentLoading ? (
                [1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-200/80" />
                ))
              ) : (siteContent?.faqs ?? []).length === 0 ? (
                <p className="text-center text-sm text-[#5f6368]">Brak danych.</p>
              ) : (
                (siteContent?.faqs ?? []).map((faq, idx) => (
                  <details
                    key={idx}
                    className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-[#1f2933]">
                      <span className="pr-4">{faq.question}</span>
                      <span className="flex-shrink-0 text-[#175244] transition-transform group-open:rotate-180">
                        ▼
                      </span>
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-[#5f6368]">{faq.answer}</p>
                  </details>
                ))
              )}
            </div>
          </section>

          {/* CTA KOŃCOWE */}
          <section
            id="cta"
            className="mt-12 rounded-3xl bg-gradient-to-r from-[#175244] via-[#0f3c33] to-[#144035] px-6 py-10 text-center text-[#fdfaf3] shadow-2xl shadow-black/30 scroll-mt-32 lg:px-10"
          >
            <h2 className="text-2xl font-bold">
              Chcesz zapisać dziecko na zajęcia próbne?
            </h2>
            <p className="mt-3 text-sm text-[#fdfaf3]/90">
              Skontaktuj się z nami – dobierzemy grupę i termin dopasowany do
              Twojej rodziny.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-4">
              <span
                className="inline-block rounded-full border border-[#ffeab2] px-6 py-2 text-sm font-medium text-[#ffeab2]"
              >
                Zadzwoń: +48 697 40 30 20
              </span>
              <button
                onClick={() => setContactFormOpen(true)}
                className="rounded-full bg-[#ffc94a] px-7 py-3 text-sm font-semibold text-[#3b2a10] shadow-lg shadow-black/25 transition-colors hover:bg-[#ffd76f]"
              >
                Napisz do nas
              </button>
            </div>
          </section>

          {/* FOOTER */}
          <footer
            id="contact"
            className="mt-10 flex flex-col items-center justify-center gap-4 border-t border-white/10 py-6 text-xs text-[#e5e7eb]/80 scroll-mt-32"
          >
            <div className="text-center">
              <p className="font-semibold">Harry English</p>
              <p>kontakt@harry-english.pl</p>
            </div>

            <div className="flex items-center gap-3">
              <a
                href="https://www.facebook.com/Zyrafa.Harry"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-white/20 px-3 py-1 transition-colors hover:border-[#ffc94a] hover:text-[#ffc94a]"
              >
                Facebook
              </a>
            </div>
          </footer>

        </div>
      </div>

      {/* CONTACT FORM MODAL */}
      <ContactForm
        isOpen={contactFormOpen}
        onClose={() => setContactFormOpen(false)}
      />

      {/* AUTH MODAL */}
      <AuthModal 
        isOpen={authModalOpen} 
        onClose={() => setAuthModalOpen(false)}
        initialMode={authModalMode}
      />

      {/* OCHRONA MAŁOLETNICH – MODAL */}
      {minorProtectionOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setMinorProtectionOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="minor-protection-title"
        >
          <div
            className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setMinorProtectionOpen(false)}
              className="absolute top-4 right-4 rounded-full p-1.5 text-[#4b5563] transition-colors hover:bg-gray-100 hover:text-[#1f2933]"
              aria-label="Zamknij"
            >
              <span className="text-xl leading-none">✕</span>
            </button>
            <h2 id="minor-protection-title" className="pr-8 text-xl font-bold text-[#1f2933]">
              Ochrona małoletnich
            </h2>
            <div className="mt-4 space-y-3 text-sm text-[#4b5563]">
              <p>
                W naszej działalności bezwzględnie przestrzegamy zasad ochrony małoletnich zgodnie z obowiązującymi przepisami prawa, w szczególności przepisów tzw. „ustawy Kamilka”.
              </p>
              <p>
                Posiadamy wdrożone Standardy Ochrony Małoletnich, obejmujące zasady zapobiegania krzywdzeniu dzieci, procedury reagowania na sytuacje zagrożenia oraz wytyczne dotyczące bezpiecznych relacji z małoletnimi.
              </p>
              <p>
                Pełna treść Standardów Ochrony Małoletnich dostępna jest tutaj:{" "}
                <a
                  href="/documents/POLITYKA OCHRONY DZIECI 13.02.2024.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#175244] underline hover:text-[#0f3c33]"
                >
                  Polityka Ochrony Dzieci
                </a>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* GALERIA – POWIĘKSZONE ZDJĘCIE */}
      {galleryZoomSrc ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setGalleryZoomSrc(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Powiększone zdjęcie z galerii"
        >
          <button
            type="button"
            onClick={() => setGalleryZoomSrc(null)}
            className="absolute top-4 right-4 z-10 rounded-full bg-white/90 p-2 text-[#1f2933] transition-colors hover:bg-white"
            aria-label="Zamknij"
          >
            <span className="text-xl leading-none">✕</span>
          </button>
          <div
            className="relative max-h-[90vh] w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <ReloadableImage
              src={galleryZoomSrc}
              alt="Zdjęcie z galerii — powiększone"
              width={1200}
              height={800}
              className="max-h-[90vh] w-auto rounded-lg object-contain"
            />
          </div>
        </div>
      ) : null}

      {/* PLAN DETAILS MODAL */}
      {selectedPlan && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setSelectedPlan(null)}
        >
          <div 
            className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto overflow-x-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-3xl z-10">
              <h2 className="text-2xl font-bold text-[#1f2933]">
                {selectedPlan === "walk" && "Let's walk - Szczegóły planu"}
                {selectedPlan === "run" && "Let's run - Szczegóły planu"}
                {selectedPlan === "swim" && "Let's swim - Szczegóły planu"}
                {selectedPlan === "fly" && "Let's fly - Szczegóły planu"}
              </h2>
              <button
                onClick={() => setSelectedPlan(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-4 sm:p-6">
              <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
                <p className="text-sm leading-relaxed text-[#1f2933]">
                  Szczegóły programu, terminy i warianty opłat ustalamy indywidualnie w biurze lub po kontakcie. Na stronie
                  nie wyświetlamy kwot — dane finansowe muszą pochodzić z aktualnej oferty szkoły.
                </p>
              </div>

              {/* Przycisk CTA – otwiera formularz „Napisz do nas” */}
              <div className="mt-6 flex gap-4">
                <button
                  onClick={() => {
                    setSelectedPlan(null);
                    setContactFormOpen(true);
                  }}
                  className="flex-1 rounded-full bg-[#175244] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0f3c33] transition-colors"
                >
                  Zapisz się
                </button>
                <button
                  onClick={() => setSelectedPlan(null)}
                  className="px-6 py-3 text-sm font-semibold text-[#4b5563] hover:text-[#1f2933] transition-colors"
                >
                  Zamknij
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ALL REVIEWS MODAL */}
      {allReviewsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setAllReviewsOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-3xl border-b border-gray-200 bg-white px-6 py-4">
              <h2 className="text-2xl font-bold text-[#1f2933]">Wszystkie opinie</h2>
              <button
                type="button"
                onClick={() => setAllReviewsOpen(false)}
                className="text-2xl leading-none text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 p-6">
              {siteContentLoading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />
                ))
              ) : (siteContent?.testimonials ?? []).length === 0 ? (
                <p className="text-center text-sm text-[#5f6368]">Brak danych.</p>
              ) : (
                (siteContent?.testimonials ?? []).map((t, idx) => (
                  <TestimonialCard key={`modal-${t.author_name}-${idx}`} t={t} idx={idx} />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
