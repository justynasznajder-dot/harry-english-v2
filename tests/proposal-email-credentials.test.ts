import { describe, expect, it } from "vitest";
import { resolveProposalEmailCredentials } from "@/lib/admin-enrollment-proposal";

describe("resolveProposalEmailCredentials", () => {
  it("always includes login email and temp password for a newly created parent", () => {
    const result = resolveProposalEmailCredentials({
      parentEmail: "new.parent@example.com",
      parentCreated: true,
      tempPasswordFromCreate: "TempPass1!",
    });
    expect(result).toEqual({
      loginEmail: "new.parent@example.com",
      tempPassword: "TempPass1!",
    });
  });

  it("includes login but no temp password for an existing parent", () => {
    const result = resolveProposalEmailCredentials({
      parentEmail: "existing.parent@example.com",
      parentCreated: false,
      tempPasswordFromCreate: null,
    });
    expect(result).toEqual({
      loginEmail: "existing.parent@example.com",
      tempPassword: null,
    });
  });

  it("does not invent a temp password when create flag lacks one", () => {
    const result = resolveProposalEmailCredentials({
      parentEmail: "edge@example.com",
      parentCreated: true,
      tempPasswordFromCreate: null,
    });
    expect(result).toEqual({
      loginEmail: "edge@example.com",
      tempPassword: null,
    });
  });
});
