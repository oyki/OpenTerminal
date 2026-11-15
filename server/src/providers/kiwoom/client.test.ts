import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth.js", () => ({
  getKiwoomAccessToken: vi.fn().mockResolvedValue("test-token"),
  getKiwoomBaseUrl: (mode: string) => `https://${mode}.example.test`,
  getKiwoomMode: () => "demo",
}));

import { kiwoomPost } from "./client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Kiwoom request pacing", () => {
  it.each([
    { mode: "demo" as const, interval: 1000 },
    { mode: "real" as const, interval: 200 },
  ])("spaces concurrent $mode requests for the same TR", async ({ mode, interval }) => {
    const requestTimes: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        requestTimes.push(Date.now());
        return {
          ok: true,
          json: async () => ({ value: "ok" }),
        } as Response;
      })
    );

    const first = kiwoomPost<{ value: string }>("PACE_TEST", "/test", {}, mode);
    const second = kiwoomPost<{ value: string }>("PACE_TEST", "/test", {}, mode);

    await expect(Promise.all([first, second])).resolves.toEqual([
      { value: "ok" },
      { value: "ok" },
    ]);

    expect(requestTimes).toHaveLength(2);
    expect(requestTimes[1] - requestTimes[0]).toBeGreaterThanOrEqual(interval);
  });

  it("keeps real requests under the account-wide five per second limit across TRs", async () => {
    const requestTimes: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        requestTimes.push(Date.now());
        return {
          ok: true,
          json: async () => ({ value: "ok" }),
        } as Response;
      })
    );

    const first = kiwoomPost<{ value: string }>("AGGREGATE_A", "/test", {}, "real");
    const second = kiwoomPost<{ value: string }>("AGGREGATE_B", "/test", {}, "real");

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(requestTimes[1] - requestTimes[0]).toBeGreaterThanOrEqual(200);
  });
});
