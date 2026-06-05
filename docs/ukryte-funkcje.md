# Ukryte funkcjonalnosci

Ten dokument sluzy do sledzenia funkcjonalnosci, ktore sa czasowo ukryte w UI, ale nadal istnieja w kodzie.

## 1) Odrzucenie propozycji grupy przez rodzica
- **Status:** ukryte w UI
- **Plik:** `src/components/UserPortal.tsx`
- **Mechanizm:** `allowProposalReject = false`
- **Co jest ukryte:** przycisk `Odrzucam` oraz panel komentarza do odrzucenia
- **Co dziala w tle:** logika odrzucenia nadal istnieje (`handleRejectProposal`, endpoint `/api/enrollment/reject`)
- **Powod biznesowy:** na ten moment rodzic nie ma opcji odrzucenia propozycji w portalu
- **Jak przywrocic:** ustawic `allowProposalReject` na `true`
- **Data decyzji:** 2026-06-02
- **Wlasciciel decyzji:** do uzupelnienia
- **Termin przegladu:** do uzupelnienia

---

## Niedokonczone (nieukryte) funkcjonalnosci

Ponizsze elementy nie sa ukryte feature flaga, ale sa jeszcze niepelne i warto je sledzic w jednym miejscu.

## 2) Krok "Umowa" w portalu rodzica
- **Status:** widoczne w UI, czesciowo placeholder
- **Plik:** `src/components/UserPortal.tsx`
- **Zakres:** sekcja `currentStep.key === 'contractSent'`
- **Co jest gotowe:** widok formularza z polami i przyciskami (`Zapisz`, `Podpisz umowe`)
- **Co brakuje:** podlaczenia zapisu danych oraz realnego procesu podpisu umowy
- **Wskazowka z UI:** komunikat "Podpisanie dokumentu bedzie dostepne w kolejnym etapie." oraz "Brak dostepnego podgladu umowy do podpisania."
- **Nastepny krok:** podpiac backend do zapisu danych i wdrozyc finalny flow podpisu
- **Wlasciciel decyzji:** do uzupelnienia
- **Termin przegladu:** do uzupelnienia
