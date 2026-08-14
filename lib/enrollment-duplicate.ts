export class DuplicateEnrollmentError extends Error {
  readonly childDisplayName: string;

  constructor(
    childDisplayName: string,
    reason: "existing" | "batch" = "existing"
  ) {
    const trimmed = childDisplayName.trim();
    const message =
      reason === "batch"
        ? `${trimmed} występuje w formularzu więcej niż raz. Usuń powtórzone wpisy przed wysłaniem.`
        : `Mamy już zgłoszenie dla ${trimmed} na ten adres e-mail. Odezwiemy się wkrótce — nie musisz wysyłać formularza ponownie.`;
    super(message);
    this.name = "DuplicateEnrollmentError";
    this.childDisplayName = trimmed;
  }
}

export function childEnrollmentIdentityKey(
  firstName: string,
  lastName: string,
  birthDate: string
): string {
  return [
    firstName.trim().toLowerCase(),
    lastName.trim().toLowerCase(),
    birthDate.trim().slice(0, 10),
  ].join("|");
}

export const DUPLICATE_CHILD_IN_FORM_MESSAGE =
  "To dziecko występuje w formularzu więcej niż raz";

export function existingEmailDifferentPhoneMessage(email: string): string {
  const normalized = email.trim().toLowerCase();
  return `Użytkownik już jest w bazie z podanym mailem ${normalized} i innym nr telefonu. Dziecko zostanie dopisane do tamtego zgłoszenia.`;
}

/** Indeksy dzieci powtórzonych w tej samej liście (imię + nazwisko + data urodzenia). */
export function findDuplicateChildIndices(
  children: Array<{ firstName: string; lastName: string; birthDate: string }>
): number[] {
  const seen = new Map<string, number>();
  const duplicateIndices: number[] = [];

  children.forEach((child, index) => {
    const firstName = child.firstName.trim();
    const lastName = child.lastName.trim();
    const birthDate = child.birthDate.trim();
    if (!firstName || !lastName || !birthDate) return;

    const key = childEnrollmentIdentityKey(firstName, lastName, birthDate);
    const firstIndex = seen.get(key);
    if (firstIndex !== undefined) {
      if (!duplicateIndices.includes(firstIndex)) {
        duplicateIndices.push(firstIndex);
      }
      duplicateIndices.push(index);
    } else {
      seen.set(key, index);
    }
  });

  return duplicateIndices;
}
