import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  kiwoomPost: vi.fn(),
  getKiwoomMode: vi.fn(() => "demo"),
  getKiwoomStockList: vi.fn(),
  searchKoreanStocks: vi.fn(),
  getKrxIndex: vi.fn(),
}));

vi.mock("../providers/kiwoom/client.js", () => ({
  kiwoomPost: mocks.kiwoomPost,
}));
vi.mock("../providers/kiwoom/auth.js", () => ({
  getKiwoomMode: mocks.getKiwoomMode,
  isKiwoomMode: (value: unknown) => value === "real" || value === "demo",
}));
vi.mock("../providers/kiwoom/stock-list.js", () => ({
  getKoreanStockList: mocks.getKiwoomStockList,
  searchKoreanStocks: mocks.searchKoreanStocks,
}));
vi.mock("../providers/kiwoom/indices.js", () => ({
  getKrxIndex: mocks.getKrxIndex,
}));

import { koreaRouter } from "./korea.js";

function fakeRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function getHandler(path: string) {
  const layer = (koreaRouter as any).stack.find((item: any) => item.route?.path === path);
  if (!layer) throw new Error(`no route registered for ${path}`);
  return layer.route.stack[0].handle as (req: Request, res: Response) => Promise<void>;
}

describe("Korean market data routes", () => {
  it("returns the server check time with the current quote", async () => {
    mocks.kiwoomPost.mockResolvedValueOnce({
      stk_nm: "삼성전자",
      cur_prc: "209000",
      pred_pre: "1000",
      flu_rt: "0.48",
    });
    const res = fakeRes();

    await getHandler("/quotes")(
      { query: { symbol: "005930", mode: "real" } } as unknown as Request,
      res
    );

    const result = vi.mocked(res.json).mock.calls[0][0] as Record<string, unknown>;
    expect(result).toMatchObject({
      symbol: "005930",
      name: "삼성전자",
      price: 209000,
      mode: "real",
      source: "kiwoom",
    });
    expect(typeof result.checkedAt).toBe("string");
    expect(Number.isNaN(Date.parse(result.checkedAt as string))).toBe(false);
  });

  it("returns a check time separately from the candle dates", async () => {
    mocks.kiwoomPost.mockResolvedValueOnce({
      stk_cd: "005930",
      stk_dt_pole_chart_qry: [{
        dt: "20261113",
        open_pric: "200000",
        high_pric: "210000",
        low_pric: "199000",
        cur_prc: "209000",
        trde_qty: "1234",
      }],
    });
    const res = fakeRes();

    await getHandler("/history/:symbol")(
      {
        params: { symbol: "005930" },
        query: { mode: "demo", date: "20261114" },
      } as unknown as Request,
      res
    );

    const result = vi.mocked(res.json).mock.calls[0][0] as {
      checkedAt: string;
      candles: Array<{ time: string }>;
    };
    expect(result.candles).toEqual([
      expect.objectContaining({ time: "2026-11-13" }),
    ]);
    expect(Number.isNaN(Date.parse(result.checkedAt))).toBe(false);
  });
});
