export const RENEWAL_STATUSES = [
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "PROPOSED",
  "NEGOTIATING",
  "ACCEPTED",
  "SIGNED",
  "RESIGNED",
] as const;

export type RenewalStatus = (typeof RENEWAL_STATUSES)[number];
