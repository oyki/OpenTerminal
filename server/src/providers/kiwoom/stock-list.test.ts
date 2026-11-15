import { beforeEach, describe, expect, it, vi } from "vitest";

const { kiwoomPostPage } = vi.hoisted(() => ({ kiwoomPostPage: vi.fn() }));
vi.mock("./client.js", () => ({ kiwoomPostPage }));

import { getKoreanStockList, searchKoreanStocks } from "./stock-list.js";

describe("Kiwoom stock list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    kiwoomPostPage
      .mockResolvedValueOnce({ data: { list: [
        { code: "005930", name: "삼성전자" },
        { code: "005935", name: "삼성전자우" },
      ] }, continuation: { contYn: "Y", nextKey: "page-2" } })
      .mockResolvedValueOnce({ data: { list: [
        { code: "000660", name: "SK하이닉스" },
      ] }, continuation: { contYn: "N", nextKey: null } })
      .mockResolvedValueOnce({ data: { list: [
        { code: "035720", name: "카카오" },
      ] }, continuation: { contYn: "N", nextKey: null } });
    kiwoomPostPage.mockResolvedValueOnce({ data: { list: [
      { code: "069500", name: "KODEX 200", marketName: "KOSPI" },
    ] }, continuation: { contYn: "N", nextKey: null } });
  });

  it("loads both supported markets and searches by code or Korean name from the cached master", async () => {
    const stocks = await getKoreanStockList("real");
    expect(stocks).toHaveLength(5);
    expect(stocks.map((stock) => stock.exchange)).toEqual(["KOSPI", "KOSPI", "KOSPI", "KOSDAQ", "KOSPI"]);
    expect(stocks.find((stock) => stock.symbol === "005935")?.type).toBe("PREFERRED");
    expect(stocks).toContainEqual({ symbol: "069500", name: "KODEX 200", exchange: "KOSPI", type: "ETF" });
    expect(await searchKoreanStocks("0059", "real")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: "005930" }),
        expect.objectContaining({ symbol: "005935" }),
      ])
    );
    expect(await searchKoreanStocks("삼성", "real")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: "005930" }),
        expect.objectContaining({ symbol: "005935" }),
      ])
    );
    expect(kiwoomPostPage).toHaveBeenCalledTimes(4);
    expect(kiwoomPostPage.mock.calls[1][4]).toEqual({ contYn: "Y", nextKey: "page-2" });
  });
});
