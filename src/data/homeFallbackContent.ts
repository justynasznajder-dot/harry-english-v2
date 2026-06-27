/**
 * Fallbacki strony głównej — używane gdy API zwróci puste listy.
 * Grafiki wskazują na pliki w `public/images/` (commitowane w repo).
 */

function slugKey(firstName: string, lastName: string): string {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "_");
  return `${norm(firstName)}_${norm(lastName)}`;
}

/** Zdjęcie lektorki z `public/images/teachers/` (dopasowanie po imieniu i nazwisku). */
export function teacherPortraitPath(
  firstName: string,
  lastName: string,
): string | null {
  const key = slugKey(firstName, lastName);
  const map: Record<string, string> = {
    anna_sznajder: "/images/teachers/anna_sznajder.jpg",
    anna_szydlowska: "/images/teachers/anna_szydlowska.jpg",
    natalia_nowozycka: "/images/teachers/natalia_nowozycka.jpg",
    shadia_abuzied: "/images/teachers/shadia_abuzied.jpg",
  };
  return map[key] ?? null;
}

export type WhyUsCard = {
  title: string;
  body: string;
  image_path: string;
};

export const WHY_US_CARDS: WhyUsCard[] = [
  {
    title: "Zabawa + nauka",
    body: "Gry, ruch, historyjki – ale zawsze z celem językowym.",
    image_path: "/images/zabawa-nauka.png",
  },
  {
    title: "Mówienie od pierwszych zajęć",
    body: "Dzieci i dorośli mówią pełnymi zdaniami, a nie tylko powtarzają słówka.",
    image_path: "/images/mowienie.png",
  },
  {
    title: "Małe grupy, indywidualne podejście",
    body: "Znamy naszych kursantów z imienia, wiemy, czego potrzebują.",
    image_path: "/images/male-grupy.png",
  },
];

export type HomeTeacher = {
  id: string;
  first_name: string;
  last_name: string;
  bio: string;
  photo: string | null;
};

export const FALLBACK_TEACHERS: HomeTeacher[] = [
  {
    id: "fallback-sznajder",
    first_name: "Anna",
    last_name: "Sznajder",
    bio: "Pedagog z wieloletnim doświadczeniem. Lektorka języka angielskiego, specjalizuje się w pracy z dziećmi w wieku przedszkolnym i wczesnoszkolnym.",
    photo: teacherPortraitPath("Anna", "Sznajder"),
  },
  {
    id: "fallback-szydlowska",
    first_name: "Anna",
    last_name: "Szydłowska",
    bio: "Lektorka z doświadczeniem w pracy z najmłodszymi dziećmi, stawia na naturalną komunikację i budowanie pewności siebie.",
    photo: teacherPortraitPath("Anna", "Szydłowska"),
  },
  {
    id: "fallback-nowozycka",
    first_name: "Natalia",
    last_name: "Nowożycka",
    bio: "Filolog z doświadczeniem zagranicznym, uwielbia pracę z dziećmi i doskonale dogaduje się z młodzieżą. Specjalizuje się również w skutecznym przygotowaniu uczniów do egzaminów.",
    photo: teacherPortraitPath("Natalia", "Nowożycka"),
  },
  {
    id: "fallback-abuzied",
    first_name: "Shadia",
    last_name: "Abuzied",
    bio: "Lektorka z doświadczeniem w pracy z najmłodszymi, skupia się na mówieniu i praktycznym użyciu języka.",
    photo: teacherPortraitPath("Shadia", "Abuzied"),
  },
];

export type HomeTestimonial = {
  author_name: string;
  body: string;
  sort_label: string | null;
  rating: number;
};

export const FALLBACK_TESTIMONIALS: HomeTestimonial[] = [
  {
    author_name: "Magdalena Straszak",
    body: "Syn mega zadowolony z lekcji! Dużo zabawy, uśmiechu a przy okazji ogrom wiedzy 😊 Serdecznie polecam zajęcia z Harry English 💕",
    sort_label: "2 tygodnie temu",
    rating: 5,
  },
  {
    author_name: "Dominika Kilka",
    body: "Polecam szkołę z czystym sumieniem! Korzystamy z zajęć ok 10lat. Pełen profesjonalizm, ale przede wszystkim dzieci zadowolone 😊",
    sort_label: "2 tygodnie temu",
    rating: 5,
  },
  {
    author_name: "Edyta Cieślak",
    body: "Super metody nauczania, świetne podejście do dzieciaków i rewelacyjne rezultaty, szczerze polecam 🥰",
    sort_label: "2 tygodnie temu",
    rating: 5,
  },
];

/** Zdjęcia z `public/images/gallery/` — statyczna galeria strony głównej. */
export const FALLBACK_GALLERY: { image_path: string; caption: string | null }[] = [
  { image_path: "/images/gallery/20.jpg", caption: "Zajęcia z Harry English" },
  { image_path: "/images/gallery/11.jpg", caption: "Zajęcia z Harry English" },
  { image_path: "/images/gallery/13.jpg", caption: "Zajęcia z Harry English" },
  { image_path: "/images/gallery/7.jpg", caption: "Zajęcia z Harry English" },
];

const BIO_BY_LAST = Object.fromEntries(
  FALLBACK_TEACHERS.map((t) => [t.last_name.toLowerCase(), t.bio]),
);

export function bioForTeacher(firstName: string, lastName: string): string | null {
  const key = lastName.trim().toLowerCase();
  return BIO_BY_LAST[key] ?? null;
}

export const FALLBACK_FAQS: { question: string; answer: string }[] = [
  {
    question: "Od jakiego wieku można zapisać dziecko?",
    answer:
      'Nasze zajęcia są przeznaczone dla dzieci od 3 roku życia. Najmłodsi uczestniczą w programie "Let\'s walk", dostosowanym do potrzeb przedszkolaków.',
  },
  {
    question: "Ile trwają zajęcia?",
    answer:
      "W zależności od wieku i poziomu: 40 minut dla przedszkolaków, 45–50 minut dla dzieci szkolnych oraz 60 minut dla młodzieży i dorosłych w zajęciach indywidualnych.",
  },
  {
    question: "Czy można dołączyć w trakcie roku?",
    answer:
      "Tak! Zawsze staramy się znaleźć odpowiednią grupę dla nowego ucznia. Skontaktuj się z nami, a dobierzemy najlepszą opcję.",
  },
  {
    question: "Jaka jest liczebność grup?",
    answer:
      "Nasze grupy liczą średnio 6 osób, co pozwala na indywidualne podejście do każdego ucznia i aktywne uczestnictwo w zajęciach.",
  },
  {
    question: "Czy oferujecie lekcje próbne?",
    answer:
      "Tak! Pierwsza lekcja jest bezpłatna — to świetna okazja, aby poznać naszą metodę i przekonać się, czy szkoła jest dla Was odpowiednia.",
  },
];
