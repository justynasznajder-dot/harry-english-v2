export const ENROLLMENT_STATUSES = [
  "NEW",
  "PROPOSED",
  "ACCEPTED",
  "SIGNED",
  "COMPLETED",
  "REJECTED",
] as const;

export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];
