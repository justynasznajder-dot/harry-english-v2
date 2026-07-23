import { describe, expect, it, vi, afterEach } from "vitest";
import { r2BillingClass, recordR2Usage, runWithR2Source, getR2Source } from "@/lib/r2-usage";

describe("r2BillingClass", () => {
  it("mapuje operacje na klasy Cloudflare", () => {
    expect(r2BillingClass("PUT")).toBe("A");
    expect(r2BillingClass("LIST")).toBe("A");
    expect(r2BillingClass("GET")).toBe("B");
    expect(r2BillingClass("DELETE")).toBe("free");
  });
});

describe("runWithR2Source", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("propaguje source w AsyncLocalStorage", async () => {
    await runWithR2Source("parent.documents.list", async () => {
      expect(getR2Source()).toBe("parent.documents.list");
    });
    expect(getR2Source()).toBe("unknown");
  });

  it("recordR2Usage pisze strukturalny log z source", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    runWithR2Source("enrollment.sign", () => {
      recordR2Usage({
        op: "PUT",
        bucket: "test-bucket",
        keyOrPrefix: "user/2026/umowy/x.pdf",
        ok: true,
        durationMs: 12,
      });
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0]?.[0] ?? "");
    expect(line.startsWith("[R2_USAGE] ")).toBe(true);
    const payload = JSON.parse(line.slice("[R2_USAGE] ".length)) as {
      type: string;
      source: string;
      billingClass: string;
      op: string;
    };
    expect(payload.type).toBe("r2_usage");
    expect(payload.source).toBe("enrollment.sign");
    expect(payload.billingClass).toBe("A");
    expect(payload.op).toBe("PUT");
  });
});
