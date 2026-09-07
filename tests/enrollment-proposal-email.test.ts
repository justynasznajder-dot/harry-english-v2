import { describe, expect, it } from "vitest";
import {
  ENROLLMENT_PROPOSAL_EMAIL_ENABLED_SCHOOL_IDS,
  isEnrollmentProposalEmailEnabled,
} from "@/lib/enrollment-proposal-email";

const DEV = "efcb641a-e5bd-4e59-aa39-c08fd1b318e9";
const PROD = "c93d5ac1-fa59-497f-b450-a4e50e1fb50d";

describe("isEnrollmentProposalEmailEnabled", () => {
  it("enables DEV school only", () => {
    expect(isEnrollmentProposalEmailEnabled(DEV)).toBe(true);
    expect(ENROLLMENT_PROPOSAL_EMAIL_ENABLED_SCHOOL_IDS.has(DEV)).toBe(true);
  });

  it("keeps PROD school disabled", () => {
    expect(isEnrollmentProposalEmailEnabled(PROD)).toBe(false);
  });

  it("rejects empty or unknown school ids", () => {
    expect(isEnrollmentProposalEmailEnabled(null)).toBe(false);
    expect(isEnrollmentProposalEmailEnabled("")).toBe(false);
    expect(isEnrollmentProposalEmailEnabled("unknown")).toBe(false);
  });
});
