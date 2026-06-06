"use client";

import { useState, useEffect } from "react";
import ReloadableImage from "../src/components/ReloadableImage";
import ContactForm from "../src/components/ContactForm";
import AuthModal from "../src/components/AuthModal";
import EnrollmentAnnouncementModal from "../src/components/EnrollmentAnnouncementModal";

export default function HomePage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"select" | "login" | "register" | "forgot-password">("select");
  const [selectedPlan, setSelectedPlan] = useState<"walk" | "run" | "swim" | "fly" | null>(null);
  const [allReviewsOpen, setAllReviewsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [galleryZoomNum, setGalleryZoomNum] = useState<number | null>(null);
  const [minorProtectionOpen, setMinorProtectionOpen] = useState(false);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setGalleryZoomNum(null);
        setMinorProtectionOpen(false);
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
              {/* LOGO + przycisk Menu (mobile) / logo wyśrodkowane (desktop) */}
              <div
                className={`flex items-center justify-between gap-3 border-b border-white/10 px-4 transition-[padding] duration-300 ease-out lg:justify-center ${
                  isScrolled ? "py-1 lg:py-2" : "py-3 lg:py-4"
                }`}
              >
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setMobileOpen(false);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="block shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffc94a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#073229] rounded"
                >
                  <ReloadableImage
                    src="/images/2zyrafa2.svg"
                    alt="Harry English logo"
                    width={220}
                    height={120}
                    priority
                    className={`w-auto object-contain transition-[max-height] duration-300 ease-out ${
                      isScrolled
                        ? "max-h-[36px] lg:max-h-[40px]"
                        : "max-h-[56px] sm:max-h-[64px] lg:max-h-[80px]"
                    }`}
                  />
                </a>

                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#ffc94a] px-4 py-2.5 text-sm font-bold text-[#3b2a10] shadow-[0_4px_16px_rgba(0,0,0,0.35)] ring-2 ring-white/25 transition-colors hover:bg-[#ffd76f] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffc94a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#073229] min-h-[44px] lg:hidden"
                  aria-label={mobileOpen ? "Zamknij menu" : "Otwórz menu nawigacji"}
                  aria-expanded={mobileOpen}
                  onClick={() => setMobileOpen((v) => !v)}
                >
                  {mobileOpen ? (
                    <>
                      <span>Zamknij</span>
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                        <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </>
                  ) : (
                    <>
                      <span>Menu</span>
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                        <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
                      </svg>
                    </>
                  )}
                </button>
              </div>

              {/* MENU DESKTOP */}
              <div className="hidden items-center justify-between px-4 py-3 lg:flex lg:px-6 lg:py-4">
                <nav className="flex flex-1 items-center justify-center gap-8 text-sm font-medium text-[#fdfaf3]">
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
                    type="button"
                    onClick={() => {
                      setAuthModalMode("register");
                      setAuthModalOpen(true);
                    }}
                    className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#ffc94a] px-5 py-2 text-xs font-semibold text-[#3b2a10] shadow-md shadow-black/20 transition-colors hover:bg-[#ffd76f]"
                  >
                    Zapisz dziecko
                  </button>
                </nav>
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
                      type="button"
                      onClick={() => {
                        setMobileOpen(false);
                        setAuthModalMode("register");
                        setAuthModalOpen(true);
                      }}
                      className="mt-2 inline-flex w-full justify-center rounded-full bg-[#ffc94a] px-6 py-3 text-xs font-semibold text-[#3b2a10] shadow-md shadow-black/20 transition-colors hover:bg-[#ffd76f]"
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

          {/* SEKCJA: DLACZEGO MY */}
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

            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <div className="rounded-2xl bg-white px-6 pb-6 shadow-md overflow-hidden">
                <div className="mb-2 h-40 w-full overflow-hidden rounded-t-xl bg-gray-300/60">
                  <button
                    type="button"
                    onClick={() => setGalleryZoomNum(22)}
                    className="group relative h-full w-full cursor-pointer transition-transform hover:scale-105 text-left"
                    aria-label="Powiększ zdjęcie: Zabawa i nauka"
                  >
                    <ReloadableImage
                      src="/images/gallery/22.jpg"
                      alt="Zabawa i nauka"
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

                <h3 className="text-center text-base font-semibold text-[#1f2933]">
                  Zabawa + nauka
                </h3>

                <p className="mt-2 text-center text-sm text-[#4b5563]">
                  Gry, ruch, historyjki – ale zawsze z celem językowym.
                </p>
              </div>

              <div className="rounded-2xl bg-white px-6 pb-6 shadow-md overflow-hidden">
                <div className="mb-2 h-40 w-full overflow-hidden rounded-t-xl bg-gray-300/60">
                  <button
                    type="button"
                    onClick={() => setGalleryZoomNum(23)}
                    className="group relative h-full w-full cursor-pointer transition-transform hover:scale-105 text-left"
                    aria-label="Powiększ zdjęcie: Mówienie od pierwszych zajęć"
                  >
                    <ReloadableImage
                      src="/images/gallery/23.jpg"
                      alt="Mówienie od pierwszych zajęć"
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

                <h3 className="text-center text-base font-semibold text-[#1f2933]">
                  Mówienie od pierwszych zajęć
                </h3>
                <p className="mt-2 text-center text-sm text-[#4b5563]">
                  Dzieci i dorośli mówią pełnymi zdaniami, a nie tylko powtarzają
                  słówka.
                </p>
              </div>

              <div className="rounded-2xl bg-white px-6 pb-6 shadow-md overflow-hidden">
                <div className="mb-2 h-40 w-full overflow-hidden rounded-t-xl bg-gray-300/60">
                  <button
                    type="button"
                    onClick={() => setGalleryZoomNum(16)}
                    className="group relative h-full w-full cursor-pointer transition-transform hover:scale-105 text-left"
                    aria-label="Powiększ zdjęcie: Małe grupy, indywidualne podejście"
                  >
                    <ReloadableImage
                      src="/images/gallery/16.jpg"
                      alt="Małe grupy, indywidualne podejście"
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

                <h3 className="text-center text-base font-semibold text-[#1f2933]">
                  Małe grupy, indywidualne podejście
                </h3>
                <p className="mt-2 text-center text-sm text-[#4b5563]">
                  Znamy naszych kursantów z imienia, wiemy, czego potrzebują.
                </p>
              </div>
            </div>
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

                <div className="text-center mb-3 py-2 border-y border-gray-200 sm:mb-4 sm:py-3">
                  <div className="text-4xl font-bold text-[#175244] sm:text-5xl">41 zł</div>
                  <div className="text-xs text-[#4b5563] mt-0.5 sm:text-sm sm:mt-1">za zajęcia</div>
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

                <div className="text-center mb-3 py-2 border-y border-gray-200 sm:mb-4 sm:py-3">
                  <div className="text-4xl font-bold text-[#175244] sm:text-5xl">47 zł</div>
                  <div className="text-xs text-[#4b5563] mt-0.5 sm:text-sm sm:mt-1">za zajęcia</div>
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

                <div className="text-center mb-3 py-2 border-y border-gray-200 sm:mb-4 sm:py-3">
                  <div className="text-4xl font-bold text-[#175244] sm:text-5xl">112 zł</div>
                  <div className="text-xs text-[#4b5563] mt-0.5 sm:text-sm sm:mt-1">za zajęcia</div>
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
                    <span className="text-[#4b5563]">2x w tygodniu</span>
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

                <div className="text-center mb-3 py-2 border-y border-gray-200 sm:mb-4 sm:py-3">
                  <div className="text-4xl font-bold text-[#175244] sm:text-5xl">190 zł</div>
                  <div className="text-xs text-[#4b5563] mt-0.5 sm:text-sm sm:mt-1">za zajęcia</div>
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
                {[20, 11, 13, 7].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setGalleryZoomNum(num)}
                    className="group relative w-full overflow-hidden rounded-2xl bg-gray-300/60 cursor-pointer transition-transform hover:scale-105 text-left aspect-[4/3] min-h-[10rem] md:min-h-0 md:h-40"
                  >
                    <ReloadableImage
                      src={`/images/gallery/${num}.jpg`}
                      alt={`Zdjęcie z zajęć ${num}`}
                      fill
                      className="object-contain md:object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-[#175244]/0 transition-colors group-hover:bg-[#175244]/20">
                      <span className="text-2xl text-white opacity-0 transition-opacity group-hover:opacity-100">
                        🔍
                      </span>
                    </div>
                  </button>
                ))}
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

            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { name: "Anna Sznajder", image: "/images/teachers/anna_sznajder.jpg", desc: "Pedagog z wieloletnim doświadczeniem. Lektorka języka angielskiego, specjalizuje się w pracy z dziećmi w wieku przedszkolnym i wczesnoszkolnym." },
                { name: "Anna Szydłowska", image: "/images/teachers/anna_szydlowska.jpg", desc: "Lektorka z doświadczeniem w pracy z najmłodszymi dziećmi, stawia na naturalną komunikację i budowanie pewności siebie." },
                { name: "Natalia Nowożycka", image: "/images/teachers/natalia_nowozycka.jpg", desc: "Filolog z doświadczeniem zagranicznym, uwielbia pracę z dziećmi i doskonale dogaduje się z młodzieżą. Specjalizuje się również w skutecznym przygotowaniu uczniów do egzaminów." },
                { name: "Shadia Abuzied", image: "/images/teachers/shadia_abuzied.jpg", desc: "Lektorka z doświadczeniem w pracy z najmłodszymi, skupia się na mówieniu i praktycznym użyciu języka." }
              ].map((teacher) => (
                <div key={teacher.name} className="rounded-2xl bg-white p-5 shadow-md hover:shadow-lg transition-shadow flex flex-col items-center text-center">
                  <div className="relative mb-4 w-[160px] h-[200px] shrink-0 overflow-hidden rounded-xl bg-gray-300/60">
                    <ReloadableImage
                      src={teacher.image}
                      alt={teacher.name}
                      fill
                      className="object-cover object-[50%_18%]"
                    />
                  </div>
                  <h3 className="text-sm font-semibold text-[#1f2933]">
                    {teacher.name}
                  </h3>
                  <p className="mt-1 text-xs text-[#4b5563]">
                    {teacher.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* OPINIE RODZICÓW - GOOGLE STYLE */}
          <section className="mt-12 rounded-3xl bg-white px-6 py-10 shadow-xl shadow-black/20 lg:px-10">
            <div className="space-y-4">
              {/* Opinia 1 - Magdalena Straszak */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[#175244] flex items-center justify-center text-white font-bold text-lg">
                    M
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                      <div>
                        <div className="font-semibold text-[#202124]">Magdalena Straszak</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[#5f6368]">Opinia z:</span>
                          <span className="text-xs text-[#5f6368]">G</span>
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <span className="text-xs font-medium text-[#5f6368]">Google</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-[#5f6368]">
                          <span>5</span>
                          <span className="text-gray-400">/</span>
                          <span>5</span>
                        </div>
                        <div className="text-xs text-[#5f6368] mt-1">2 tygodnie temu</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <span className="inline-block bg-black text-white px-2 py-1 rounded text-xs font-medium">NOWA</span>
                    </div>
                    <div className="mt-3 text-sm text-[#202124] leading-relaxed">
                      Syn mega zadowolony z lekcji! Dużo zabawy, uśmiechu a przy okazji ogrom wiedzy 😊 Serdecznie polecam zajęcia z Harry English 💕
                    </div>
                  </div>
                </div>
              </div>

              {/* Opinia 2 - Dominika Kilka */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[#175244] flex items-center justify-center text-white font-bold text-lg">
                    D
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                      <div>
                        <div className="font-semibold text-[#202124]">Dominika Kilka</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[#5f6368]">Opinia z:</span>
                          <span className="text-xs text-[#5f6368]">G</span>
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <span className="text-xs font-medium text-[#5f6368]">Google</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-[#5f6368]">
                          <span>5</span>
                          <span className="text-gray-400">/</span>
                          <span>5</span>
                        </div>
                        <div className="text-xs text-[#5f6368] mt-1">2 tygodnie temu</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <span className="inline-block bg-black text-white px-2 py-1 rounded text-xs font-medium">NOWA</span>
                    </div>
                    <div className="mt-3 text-sm text-[#202124] leading-relaxed">
                      Polecam szkołę z czystym sumieniem! Korzystamy z zajęć ok 10lat. Pełen profesjonalizm, ale przede wszystkim dzieci zadowolone 😊
                    </div>
                  </div>
                </div>
              </div>

              {/* Opinia 3 - Edyta Cieślak */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gray-400 flex items-center justify-center text-white font-bold text-lg">
                    E
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                      <div>
                        <div className="font-semibold text-[#202124]">Edyta Cieślak</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[#5f6368]">Opinia z:</span>
                          <span className="text-xs text-[#5f6368]">G</span>
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <span className="text-xs font-medium text-[#5f6368]">Google</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-[#5f6368]">
                          <span>5</span>
                          <span className="text-gray-400">/</span>
                          <span>5</span>
                        </div>
                        <div className="text-xs text-[#5f6368] mt-1">2 tygodnie temu</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <span className="inline-block bg-black text-white px-2 py-1 rounded text-xs font-medium">NOWA</span>
                    </div>
                    <div className="mt-3 text-sm text-[#202124] leading-relaxed">
                      Super metody nauczania, świetne podejście do dzieciaków i rewelacyjne rezultaty, szczerze polecam 🥰
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 text-center">
              <button 
                onClick={() => setAllReviewsOpen(true)}
                className="inline-flex items-center gap-2 text-sm text-[#1a73e8] hover:underline font-semibold"
              >
                Zobacz wszystkie opinie google
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
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

            <div className="max-w-3xl mx-auto space-y-3">
              {[
                { q: "Od jakiego wieku można zapisać dziecko?", a: "Nasze zajęcia są przeznaczone dla dzieci od 3 roku życia. Najmłodsi uczniowie uczestniczą w programie \"Let's walk\", który jest specjalnie dostosowany do potrzeb przedszkolaków." },
                { q: "Ile trwają zajęcia?", a: "W zależności od wieku i poziomu: 40 minut dla przedszkolaków, 45-50 minut dla dzieci szkolnych, oraz 60 minut dla młodzieży i dorosłych w zajęciach indywidualnych." },
                { q: "Czy można dołączyć w trakcie roku?", a: "Tak! Zawsze staramy się znaleźć odpowiednią grupę dla nowego ucznia. Skontaktuj się z nami, a dobierzemy najlepszą opcję." },
                { q: "Jaka jest liczebność grup?", a: "Nasze grupy liczą średnio 6 osób, co pozwala na indywidualne podejście do każdego ucznia i aktywne uczestnictwo w zajęciach." },
                { q: "Czy oferujecie lekcje próbne?", a: "Tak! Pierwsza lekcja jest bezpłatna. To świetna okazja, aby poznać naszą metodę nauczania i przekonać się, czy nasza szkoła jest odpowiednia dla Twojego dziecka." }
              ].map((faq, idx) => (
                <details key={idx} className="group bg-white rounded-xl p-5 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                  <summary className="cursor-pointer font-semibold text-[#1f2933] flex items-center justify-between list-none">
                    <span className="pr-4">{faq.q}</span>
                    <span className="text-[#175244] group-open:rotate-180 transition-transform flex-shrink-0">▼</span>
                  </summary>
                  <p className="mt-3 text-sm text-[#5f6368] leading-relaxed">{faq.a}</p>
                </details>
              ))}
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

      <EnrollmentAnnouncementModal
        onOpenEnrollmentForm={() => {
          setAuthModalMode("register");
          setAuthModalOpen(true);
        }}
      />

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
      {galleryZoomNum !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setGalleryZoomNum(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Powiększone zdjęcie z galerii"
        >
          <button
            type="button"
            onClick={() => setGalleryZoomNum(null)}
            className="absolute top-4 right-4 z-10 rounded-full bg-white/90 p-2 text-[#1f2933] transition-colors hover:bg-white"
            aria-label="Zamknij"
          >
            <span className="text-xl leading-none">✕</span>
          </button>
          <div
            className="relative max-h-[90vh] max-w-4xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <ReloadableImage
              src={`/images/gallery/${galleryZoomNum}.jpg`}
              alt={`Zdjęcie z zajęć ${galleryZoomNum} – powiększone`}
              width={1200}
              height={800}
              className="max-h-[90vh] w-auto rounded-lg object-contain"
            />
          </div>
        </div>
      )}

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
              {/* Informacja o częstotliwości */}
              <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-blue-50 rounded-xl border border-blue-200">
                <p className="text-xs sm:text-sm text-[#1f2933]">
                  {selectedPlan === "swim" ? (
                    <>
                      <strong>Częstotliwość zajęć:</strong> Poniższe ceny dotyczą zajęć <strong>2x w tygodniu</strong>.
                    </>
                  ) : (
                    <>
                      <strong>Częstotliwość zajęć:</strong> Poniższe ceny dotyczą zajęć <strong>1x w tygodniu</strong>.{" "}
                      W wersji intensywnej (<strong>2x w tygodniu</strong>) koszt miesięczny i roczny należy pomnożyć <strong>x2</strong>.
                    </>
                  )}
                </p>
              </div>

              {/* Mobile: układ kartowy – bez scrollu na boki */}
              <div className="space-y-3 md:hidden">
                {[
                  {
                    label: "koszt 1 zajęć",
                    rok: { walk: "41 zł", run: "47 zł", swim: "112 zł", fly: "190 zł" },
                    ratalna: { walk: "45 zł", run: "51 zł", swim: "120 zł", fly: "—" },
                    pojedyncze: { walk: "49 zł", run: "55 zł", swim: "128 zł", fly: "199 zł" },
                  },
                  {
                    label: "koszt miesiąca",
                    rok: { walk: "135 zł", run: "155 zł", swim: "370 zł", fly: "—" },
                    ratalna: { walk: "149 zł", run: "168 zł", swim: "396 zł", fly: "—" },
                    pojedyncze: { walk: "162 zł", run: "182 zł", swim: "422 zł", fly: "—" },
                  },
                  {
                    label: "koszt roku",
                    rok: { walk: "1 353 zł", run: "1 551 zł", swim: "3 696 zł", fly: "—" },
                    ratalna: { walk: "1 485 zł", run: "1 683 zł", swim: "3 960 zł", fly: "—" },
                    pojedyncze: { walk: "1 617 zł", run: "1 815 zł", swim: "4 224 zł", fly: "—" },
                  },
                ].map((row) => (
                  <div key={row.label} className="rounded-xl border border-gray-200 bg-gray-50/50 p-3">
                    <div className="text-sm font-semibold text-[#1f2933] mb-2">{row.label}</div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <div className="text-[#4b5563]">rok z góry</div>
                        <div className="font-bold text-[#1f2933]">{row.rok[selectedPlan!]}</div>
                      </div>
                      <div>
                        <div className="text-[#4b5563]">ratalna (x10)</div>
                        <div className="font-bold text-[#1f2933]">{row.ratalna[selectedPlan!]}</div>
                      </div>
                      <div>
                        <div className="text-[#4b5563]">pojedyncze</div>
                        <div className="font-bold text-[#1f2933]">{row.pojedyncze[selectedPlan!]}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: tabela */}
              <div className="hidden md:block rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-sm font-semibold text-[#1f2933]"></th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-[#1f2933]">opłata za rok z góry</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-[#1f2933]">opłata ratalna (x10)</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-[#1f2933]">opłata za pojedyncze zajęcia</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-200">
                        <td className="px-4 py-3 text-sm font-medium text-[#4b5563]">koszt 1 zajęć</td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-[#1f2933]">
                          {selectedPlan === "walk" && "41 zł"}
                          {selectedPlan === "run" && "47 zł"}
                          {selectedPlan === "swim" && "112 zł"}
                          {selectedPlan === "fly" && "190 zł"}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-[#1f2933]">
                          {selectedPlan === "walk" && "45 zł"}
                          {selectedPlan === "run" && "51 zł"}
                          {selectedPlan === "swim" && "120 zł"}
                          {selectedPlan === "fly" && "—"}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-[#1f2933]">
                          {selectedPlan === "walk" && "49 zł"}
                          {selectedPlan === "run" && "55 zł"}
                          {selectedPlan === "swim" && "128 zł"}
                          {selectedPlan === "fly" && "199 zł"}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="px-4 py-3 text-sm font-medium text-[#4b5563]">koszt miesiąca</td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-[#1f2933]">
                          {selectedPlan === "walk" && "135 zł"}
                          {selectedPlan === "run" && "155 zł"}
                          {selectedPlan === "swim" && "370 zł"}
                          {selectedPlan === "fly" && "—"}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-[#1f2933]">
                          {selectedPlan === "walk" && "149 zł"}
                          {selectedPlan === "run" && "168 zł"}
                          {selectedPlan === "swim" && "396 zł"}
                          {selectedPlan === "fly" && "—"}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-[#1f2933]">
                          {selectedPlan === "walk" && "162 zł"}
                          {selectedPlan === "run" && "182 zł"}
                          {selectedPlan === "swim" && "422 zł"}
                          {selectedPlan === "fly" && "—"}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-sm font-medium text-[#4b5563]">koszt roku</td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-[#1f2933]">
                          {selectedPlan === "walk" && "1 353 zł"}
                          {selectedPlan === "run" && "1 551 zł"}
                          {selectedPlan === "swim" && "3 696 zł"}
                          {selectedPlan === "fly" && "—"}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-[#1f2933]">
                          {selectedPlan === "walk" && "1 485 zł"}
                          {selectedPlan === "run" && "1 683 zł"}
                          {selectedPlan === "swim" && "3 960 zł"}
                          {selectedPlan === "fly" && "—"}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-[#1f2933]">
                          {selectedPlan === "walk" && "1 617 zł"}
                          {selectedPlan === "run" && "1 815 zł"}
                          {selectedPlan === "swim" && "4 224 zł"}
                          {selectedPlan === "fly" && "—"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Przycisk CTA – formularz zapisu dziecka */}
              <div className="mt-6 flex gap-4">
                <button
                  onClick={() => {
                    setSelectedPlan(null);
                    setAuthModalMode("register");
                    setAuthModalOpen(true);
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setAllReviewsOpen(false)}
        >
          <div 
            className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-3xl z-10">
              <h2 className="text-2xl font-bold text-[#1f2933]">Wszystkie opinie</h2>
              <button
                onClick={() => setAllReviewsOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Pozostałe opinie - w kolejności od najnowszych */}
              {/* Anna Tyrka - 10 godzin temu */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-lg">
                    A
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                      <div>
                        <div className="font-semibold text-[#202124]">Anna Tyrka</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[#5f6368]">Opinia z:</span>
                          <span className="text-xs text-[#5f6368]">G</span>
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <span className="text-xs font-medium text-[#5f6368]">Google</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-[#5f6368]">
                          <span>5</span>
                          <span className="text-gray-400">/</span>
                          <span>5</span>
                        </div>
                        <div className="text-xs text-[#5f6368] mt-1">10 godzin temu</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <span className="inline-block bg-black text-white px-2 py-1 rounded text-xs font-medium">NOWA</span>
                    </div>
                    <div className="mt-3 text-sm text-[#202124] leading-relaxed">
                      Lekcje angielskiego z Harry English to absolutna przyjemność dla moich dzieci! Znamy Panią Anię od początku działalności szkoły. To niezwykle cierpliwa,...
                    </div>
                  </div>
                </div>
              </div>

              {/* Martyna Bulik - tydzień temu */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
                    M
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                      <div>
                        <div className="font-semibold text-[#202124]">Martyna Bulik</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[#5f6368]">Opinia z:</span>
                          <span className="text-xs text-[#5f6368]">G</span>
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <span className="text-xs font-medium text-[#5f6368]">Google</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-[#5f6368]">
                          <span>5</span>
                          <span className="text-gray-400">/</span>
                          <span>5</span>
                        </div>
                        <div className="text-xs text-[#5f6368] mt-1">tydzień temu</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <span className="inline-block bg-black text-white px-2 py-1 rounded text-xs font-medium">NOWA</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* KRZYSZTOF KILKA - 2 tygodnie temu */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gray-400 flex items-center justify-center text-white font-bold text-lg">
                    K
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                      <div>
                        <div className="font-semibold text-[#202124]">KRZYSZTOF KILKA</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[#5f6368]">Opinia z:</span>
                          <span className="text-xs text-[#5f6368]">G</span>
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <span className="text-xs font-medium text-[#5f6368]">Google</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-[#5f6368]">
                          <span>5</span>
                          <span className="text-gray-400">/</span>
                          <span>5</span>
                        </div>
                        <div className="text-xs text-[#5f6368] mt-1">2 tygodnie temu</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <span className="inline-block bg-black text-white px-2 py-1 rounded text-xs font-medium">NOWA</span>
                    </div>
                    <div className="mt-3 text-sm text-[#202124] leading-relaxed">
                      Z całego serca polecam szkołę języka angielskiego Harry! Profesjonalni i zaangażowani lektorzy, świetna atmosfera oraz zajęcia prowadzone w bardzo przystępny i...
                    </div>
                  </div>
                </div>
              </div>

              {/* Marta S - 2 tygodnie temu */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gray-400 flex items-center justify-center text-white font-bold text-lg">
                    M
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                      <div>
                        <div className="font-semibold text-[#202124]">Marta S</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[#5f6368]">Opinia z:</span>
                          <span className="text-xs text-[#5f6368]">G</span>
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <span className="text-xs font-medium text-[#5f6368]">Google</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-[#5f6368]">
                          <span>5</span>
                          <span className="text-gray-400">/</span>
                          <span>5</span>
                        </div>
                        <div className="text-xs text-[#5f6368] mt-1">2 tygodnie temu</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <span className="inline-block bg-black text-white px-2 py-1 rounded text-xs font-medium">NOWA</span>
                    </div>
                    <div className="mt-3 text-sm text-[#202124] leading-relaxed">
                      Serdecznie polecam angielski z Harry English. Zajęcia prowadzone bardzo ciekawie, z wykorzystaniem różnych metod, w tym moc zabawy. Dzięki tym lekcjom z łatwością przychodzi nauka w szkole. Dziecko zadowolone
                    </div>
                  </div>
                </div>
              </div>

              {/* Maciej - 2 lata temu */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-lg">
                    M
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                      <div>
                        <div className="font-semibold text-[#202124]">Maciej</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[#5f6368]">Opinia z:</span>
                          <span className="text-xs text-[#5f6368]">G</span>
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <span className="text-xs font-medium text-[#5f6368]">Google</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-[#5f6368]">
                          <span>5</span>
                          <span className="text-gray-400">/</span>
                          <span>5</span>
                        </div>
                        <div className="text-xs text-[#5f6368] mt-1">Edytowano 2 lata temu</div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-[#202124] leading-relaxed">
                      Polecam! Szkoła ma rewelacyjne podejście (nauka przez zabawę) i znakomitą organizację (zajęcia są po przedszkolu w sali przedszkolnej) - nasz maluch wręcz czeka na zajęcia.
                    </div>
                  </div>
                </div>
              </div>

              {/* Sylwia Nocoń - 2 lata temu */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gray-400 flex items-center justify-center text-white font-bold text-lg">
                    S
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                      <div>
                        <div className="font-semibold text-[#202124]">Sylwia Nocoń</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[#5f6368]">Opinia z:</span>
                          <span className="text-xs text-[#5f6368]">G</span>
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <span className="text-xs font-medium text-[#5f6368]">Google</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-[#5f6368]">
                          <span>5</span>
                          <span className="text-gray-400">/</span>
                          <span>5</span>
                        </div>
                        <div className="text-xs text-[#5f6368] mt-1">2 lata temu</div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-[#202124] leading-relaxed">
                      Zajęcia są prowadzone w sposób kreatywny, nauka połączona z zabawą, mój syn jest zadowolony z takiej formy edukacji, polecam :)
                    </div>
                  </div>
                </div>
              </div>

              {/* Przemysław Łuć - 3 lata temu */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-teal-500 flex items-center justify-center text-white font-bold text-lg">
                    P
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                      <div>
                        <div className="font-semibold text-[#202124]">Przemysław Łuć</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[#5f6368]">Opinia z:</span>
                          <span className="text-xs text-[#5f6368]">G</span>
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <span className="text-xs font-medium text-[#5f6368]">Google</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-[#5f6368]">
                          <span>5</span>
                          <span className="text-gray-400">/</span>
                          <span>5</span>
                        </div>
                        <div className="text-xs text-[#5f6368] mt-1">3 lata temu</div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-[#202124] leading-relaxed">
                      Polecam.
                    </div>
                  </div>
                </div>
              </div>

              {/* Przemek - 3 lata temu */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-rose-700 flex items-center justify-center text-white font-bold text-lg">
                    P
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                      <div>
                        <div className="font-semibold text-[#202124]">Przemek</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[#5f6368]">Opinia z:</span>
                          <span className="text-xs text-[#5f6368]">G</span>
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <span className="text-xs font-medium text-[#5f6368]">Google</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-[#5f6368]">
                          <span>5</span>
                          <span className="text-gray-400">/</span>
                          <span>5</span>
                        </div>
                        <div className="text-xs text-[#5f6368] mt-1">3 lata temu</div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-[#202124] leading-relaxed">
                      Bardzo polecam, "Harry Uczy" moich dwóch synów w różnym wieku, oboje zawsze chętni na zajęcia i zadowoleni po!
                    </div>
                  </div>
                </div>
              </div>

              {/* Piotr Poloczek - 3 lata temu */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-lg">
                    P
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                      <div>
                        <div className="font-semibold text-[#202124]">Piotr Poloczek</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[#5f6368]">Opinia z:</span>
                          <span className="text-xs text-[#5f6368]">G</span>
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <span className="text-xs font-medium text-[#5f6368]">Google</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-[#5f6368]">
                          <span>5</span>
                          <span className="text-gray-400">/</span>
                          <span>5</span>
                        </div>
                        <div className="text-xs text-[#5f6368] mt-1">3 lata temu</div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-[#202124] leading-relaxed">
                      Super lekcje, super atmosfera, synek bardzo zadowolony, polecam
                    </div>
                  </div>
                </div>
              </div>

              {/* Karol Skutela - 3 lata temu */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-pink-500 flex items-center justify-center text-white font-bold text-lg">
                    K
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                      <div>
                        <div className="font-semibold text-[#202124]">Karol Skutela</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[#5f6368]">Opinia z:</span>
                          <span className="text-xs text-[#5f6368]">G</span>
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <span className="text-xs font-medium text-[#5f6368]">Google</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-[#5f6368]">
                          <span>5</span>
                          <span className="text-gray-400">/</span>
                          <span>5</span>
                        </div>
                        <div className="text-xs text-[#5f6368] mt-1">3 lata temu</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ewa Skutela - 3 lata temu */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white font-bold text-lg">
                    E
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                      <div>
                        <div className="font-semibold text-[#202124]">Ewa Skutela</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[#5f6368]">Opinia z:</span>
                          <span className="text-xs text-[#5f6368]">G</span>
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <span className="text-xs font-medium text-[#5f6368]">Google</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-[#5f6368]">
                          <span>5</span>
                          <span className="text-gray-400">/</span>
                          <span>5</span>
                        </div>
                        <div className="text-xs text-[#5f6368] mt-1">3 lata temu</div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-[#202124] leading-relaxed">
                      Zajęcia angielskiego prowadzone na najwyższym poziomie ! Kreatywność i zaangażowanie P. Anii sprawia ze dzieci z entuzjazmem i uśmiechem chodzą na lekcje! Polecam!!
                    </div>
                  </div>
                </div>
              </div>

              {/* Michalina Krzysteczko - 3 lata temu */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
                    M
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                      <div>
                        <div className="font-semibold text-[#202124]">Michalina Krzysteczko</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[#5f6368]">Opinia z:</span>
                          <span className="text-xs text-[#5f6368]">G</span>
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <span className="text-xs font-medium text-[#5f6368]">Google</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-[#5f6368]">
                          <span>5</span>
                          <span className="text-gray-400">/</span>
                          <span>5</span>
                        </div>
                        <div className="text-xs text-[#5f6368] mt-1">3 lata temu</div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-[#202124] leading-relaxed">
                      Zajęcia prowadzony są w bardzo kreatywny sposób. Jako mama dwójki dzieci uczęszczających na zajęcia z języka angielskiego do Harry English serdecznie polecam. 😊 Dzieci idą bardzo chętnie, a poziom wiedzy zaskakuje każdego dnia. 🙌
                    </div>
                  </div>
                </div>
              </div>

              {/* Barbara Wrzesinska - 3 lata temu */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-lg">
                    B
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                      <div>
                        <div className="font-semibold text-[#202124]">Barbara Wrzesinska</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[#5f6368]">Opinia z:</span>
                          <span className="text-xs text-[#5f6368]">G</span>
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <span className="text-xs font-medium text-[#5f6368]">Google</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-[#5f6368]">
                          <span>5</span>
                          <span className="text-gray-400">/</span>
                          <span>5</span>
                        </div>
                        <div className="text-xs text-[#5f6368] mt-1">3 lata temu</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
