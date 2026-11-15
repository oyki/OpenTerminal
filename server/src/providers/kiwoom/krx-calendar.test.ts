
import { describe, expect, it } from "vitest";
import { evaluateKrxMarketStatus } from "./krx-calendar.js";

describe("KRX market status", () => {
  it.each([
    "2026-01-01",
    "2026-02-16",
    "2026-02-17",
    "2026-02-18",
    "2026-03-02",
    "2026-05-01",
    "2026-05-05",
    "2026-05-25",
    "2026-06-03",
    "2026-07-17",
    "2026-08-17",
    "2026-09-24",
    "2026-09-25",
    "2026-10-05",
    "2026-10-09",
    "2026-12-25",
    "2026-12-31",
  ])("marks official 2026 closure %s as closed", (date) => {
    expect(evaluateKrxMarketStatus(date, "12:00").status).toBe("CLOSED");
  });

  it("uses the delayed opening hours for the first 2026 trading day", () => {
    expect(evaluateKrxMarketStatus("2026-01-02", "09:59")).toEqual({
      status: "CLOSED",
      reason: "BEFORE_HOURS",
    });
    expect(evaluateKrxMarketStatus("2026-01-02", "10:00")).toEqual({
      status: "OPEN",
      reason: "REGULAR_SESSION",
    });
  });

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
