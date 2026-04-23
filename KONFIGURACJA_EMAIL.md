# Konfiguracja poczty (formularz kontaktowy, maile systemowe)

Formularz kontaktowy i maile systemowe wysyłane są z **kontakt@harry-english.pl** przez Zoho Mail.

## Błąd 535 „Authentication Failed”?

To oznacza, że Zoho odrzuca hasło. Poniższe kroki pomogą je naprawić.

---

## 1. Wygeneruj hasło aplikacji

**Ważne:** Użyj strony **accounts.zoho.com**, a nie ustawień Zoho Mail.

1. Otwórz **https://accounts.zoho.eu** (jeśli logujesz się przez .eu) lub **https://accounts.zoho.com** (jeśli przez .com)
2. Zaloguj się na konto z adresem **kontakt@harry-english.pl**
3. Kliknij **ikona swojego profilu** (prawy górny róg) → **My Account** (Moje konto)
4. W menu z lewej strony wybierz **Security** → **App Passwords** (Hasła aplikacji)
5. Kliknij **Generate New Password**
6. Wpisz nazwę (np. „Strona”) i zatwierdź
7. **Skopiuj hasło** – będzie widoczne tylko raz. Nie dodawaj spacji ani enter.

Jeśli **nie masz 2FA**, możesz użyć zwykłego hasła do konta Zoho w `EMAIL_PASS`.

## 2. Edytuj plik `.env.local`

Otwórz plik `.env.local` i zastąp placeholder:

```
EMAIL_PASS=WSTAW_TUTAJ_HASLO_APLIKACJI_ZOHO
```

napisanym przez siebie hasłem z Zoho, np.:

```
EMAIL_PASS=abcdefghijklmnop
```

## 3. Sprawdź format w `.env.local`

- **Bez cudzysłowów:** `EMAIL_PASS=abcdefghijklmnop`
- **Bez spacji** przed i po znaku `=`
- **Jedna linia** – hasło nie może być w wielu liniach
- **Z cudzysłowami** gdy hasło ma znaki specjalne: `EMAIL_PASS="a1b2-c3d4"`

## 4. Restart serwera

Po zapisaniu `.env.local` zrestartuj serwer deweloperski (Ctrl+C i ponownie `npm run dev`).

---

**Podsumowanie – w `.env.local` musisz mieć:**
- `EMAIL_USER=kontakt@harry-english.pl` ✅ (już ustawione)
- `EMAIL_PASS=` **[wklej tutaj hasło aplikacji z Zoho]**
