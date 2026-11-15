
import { describe, expect, it } from "vitest";
import { evaluateKrxMarketStatus } from "./krx-calendar.js";

describe("KRX market status", () => {
  it.each([
    ["09:59", "CLOSED", "BEFORE_HOURS"],
    ["10:00", "OPEN", "REGULAR_SESSION"],
    ["12:00", "OPEN", "REGULAR_SESSION"],
    ["16:29", "OPEN", "REGULAR_SESSION"],
    ["16:30", "CLOSED", "AFTER_HOURS"],
  ] as const)(
    "CSAT day at %s should be %s",
    (time, status, reason) => {
      expect(
        evaluateKrxMarketStatus("2026-11-19", time)
      ).toEqual({ status, reason });
    }
  );

  it("returns CLOSED for a registered holiday", () => {
    expect(
      evaluateKrxMarketStatus("2026-12-25", "12:00")
    ).toEqual({
      status: "CLOSED",
      reason: "CHRISTMAS_HOLIDAY",
    });
  });

  it("returns UNKNOWN for an unregistered weekday", () => {
    expect(
      evaluateKrxMarketStatus("2026-11-13", "12:00")
    ).toEqual({
      status: "UNKNOWN",
      reason: "TRADING_CALENDAR_NOT_VERIFIED",
    });
  });

  it("rejects an invalid time", () => {
    expect(() =>
      evaluateKrxMarketStatus("2026-11-19", "25:00")
    ).toThrow("Invalid KRX time");
  });
});
