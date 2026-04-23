'use client';

export default function LektorPortal() {
  return (
    <>
      <div className="bg-[#f8f6f3] rounded-3xl p-8 shadow-xl mb-8">
        <h2 className="text-2xl font-bold text-[#1f2933] mb-6">📚 Materiały do nauki</h2>
        <p className="text-gray-600 mb-4">
          Tutaj znajdziesz materiały edukacyjne, ćwiczenia i zasoby do prowadzenia zajęć.
        </p>
        
        <div className="grid md:grid-cols-3 gap-4 mt-6">
          <div className="bg-white rounded-xl p-6 shadow-md">
            <h3 className="font-semibold text-[#1f2933] mb-2">Materiały dla dzieci</h3>
            <p className="text-sm text-gray-600 mb-4">Pliki PDF, prezentacje, ćwiczenia</p>
            <button className="px-4 py-2 bg-[#175244] text-white rounded-lg hover:bg-[#144a37] transition-colors text-sm">
              Zobacz materiały
            </button>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-md">
            <h3 className="font-semibold text-[#1f2933] mb-2">Gry i zabawy</h3>
            <p className="text-sm text-gray-600 mb-4">Interaktywne ćwiczenia dla uczniów</p>
            <button className="px-4 py-2 bg-[#175244] text-white rounded-lg hover:bg-[#144a37] transition-colors text-sm">
              Zobacz gry
            </button>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-md">
            <h3 className="font-semibold text-[#1f2933] mb-2">Zadania domowe</h3>
            <p className="text-sm text-gray-600 mb-4">Przygotowane zadania do wysłania</p>
            <button className="px-4 py-2 bg-[#175244] text-white rounded-lg hover:bg-[#144a37] transition-colors text-sm">
              Zarządzaj zadaniami
            </button>
          </div>
        </div>
      </div>

      <div className="bg-[#f8f6f3] rounded-3xl p-8 shadow-xl">
        <h2 className="text-2xl font-bold text-[#1f2933] mb-6">📋 Moje grupy</h2>
        <p className="text-gray-600">
          Przeglądaj listy uczniów w swoich grupach i zarządzaj ich postępami.
        </p>
      </div>
    </>
  );
}
