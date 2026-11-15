
import { kiwoomPost } from "./client.js";
import type { KiwoomMode } from "./auth.js";

export type KoreanStock = {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
};

type KiwoomStock = {
  code: string;
  name: string;
};

const CACHE_TTL = 24 * 60 * 60 * 1000;

const cache = new Map<
  KiwoomMode,
  { stocks: KoreanStock[]; expiresAt: number }
>();

const pending = new Map<
  KiwoomMode,
  Promise<KoreanStock[]>
>();

async function fetchStockList(
  mode: KiwoomMode
): Promise<KoreanStock[]> {
  const markets = [
    { code: "0", exchange: "KRX" },
    { code: "10", exchange: "KOSDAQ" },
  ];

  const results = await Promise.all(
    markets.map(async (market) => {
      const response = await kiwoomPost<{
        list?: KiwoomStock[];
      }>(
        "ka10099",
        "/api/dostk/stkinfo",
        { mrkt_tp: market.code },
        mode
      );

      if (!Array.isArray(response.list)) {
        throw new Error(
          `Invalid Kiwoom stock list: ${market.code}`
        );
      }

      return response.list
        .filter(
          (stock) =>
            /^\d{6}$/.test(stock.code) &&
            typeof stock.name === "string"
        )
        .map((stock) => ({
          symbol: stock.code,
          name: stock.name,
          exchange: market.exchange,
          type: "EQUITY",
        }));
    })
  );

  return Array.from(
    new Map(
      results.flat().map((stock) => [
        stock.symbol,
        stock,
      ])
    ).values()
  );
}

export async function getKoreanStockList(
  mode: KiwoomMode
): Promise<KoreanStock[]> {
  const now = Date.now();
  const cached = cache.get(mode);

  if (cached && cached.expiresAt > now) {
    return cached.stocks;
  }

  const existing = pending.get(mode);
  if (existing) return existing;

  const request = fetchStockList(mode);
  pending.set(mode, request);

  try {
    const stocks = await request;

    cache.set(mode, {
      stocks,
      expiresAt: Date.now() + CACHE_TTL,
    });

    return stocks;
  } finally {
    pending.delete(mode);
  }
}

export async function searchKoreanStocks(
  query: string,
  mode: KiwoomMode
): Promise<KoreanStock[]> {
  const stocks = await getKoreanStockList(mode);
  const q = query.trim().toLocaleLowerCase();

  return stocks
    .filter((stock) =>
      stock.name.toLocaleLowerCase().includes(q)
    )
    .sort((a, b) => {
      const aExact =
        a.name.toLocaleLowerCase() === q ? 0 : 1;
      const bExact =
        b.name.toLocaleLowerCase() === q ? 0 : 1;

      return aExact - bExact;
    })
    .slice(0, 30);
}
