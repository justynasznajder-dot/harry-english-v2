/** Typy i helpery listy rodziców bez opłat — bez importu bazy (bezpieczne dla Client Components). */

export type ComplimentaryParentRow = {
  id: string;
  source: "USER" | "ENROLLMENT";
  parentId: string | null;
  parentEmail: string | null;
  firstName: string;
  lastName: string;
  email: string;
};

export type ComplimentaryCandidate = {
  key: string;
  source: "USER" | "ENROLLMENT";
  parentId: string | null;
  parentEmail: string | null;
  firstName: string;
  lastName: string;
  email: string;
};

export function isParentInComplimentaryList(
  parent: { id: string; email: string; parentUserId?: string | null },
  complimentaryParents: ComplimentaryParentRow[]
): boolean {
  const parentEmail = (parent.email ?? "").trim().toLowerCase();
  const userId = (parent.parentUserId ?? "").trim();
  return complimentaryParents.some(
    (p) =>
      (p.parentId &&
        (p.parentId === parent.id || (userId.length > 0 && p.parentId === userId))) ||
      (parentEmail.length > 0 &&
        (p.email.trim().toLowerCase() === parentEmail ||
          (p.parentEmail ?? "").trim().toLowerCase() === parentEmail))
  );
}
