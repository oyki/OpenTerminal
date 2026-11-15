
import { kiwoomPostPage, type KiwoomContinuation } from "./client.js";
import type { KiwoomMode } from "./auth.js";

export type KoreanStock = {
  symbol: string;
  name: string;
  exchange: string;
  type: "COMMON" | "PREFERRED" | "ETF";
};

type KiwoomStock = {
  code: string;
  name: string;
  marketName?: string;
};

const CACHE_TTL = 24 * 60 * 60 * 1000;
const MAX_PAGES = 10;
const PAGE_DELAY_MS = 200;

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
    { code: "0", exchange: "KOSPI", type: "COMMON" },
    { code: "10", exchange: "KOSDAQ", type: "COMMON" },
    { code: "8", exchange: "KRX", type: "ETF" },
  ] as const;

  const results: KoreanStock[][] = [];
  for (const market of markets) {
    const marketStocks: KoreanStock[] = [];
    let continuation: KiwoomContinuation | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      if (page > 0) {
        await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
      }

      const response = await kiwoomPostPage<{
        list?: KiwoomStock[];
      }>(
        "ka10099",
        "/api/dostk/stkinfo",
        { mrkt_tp: market.code },
        mode,
        continuation
      );

      if (!Array.isArray(response.data.list)) {
        throw new Error(`Invalid Kiwoom stock list: ${market.code}`);
      }

      const pageStocks = response.data.list
        .filter(
          (stock) =>
            /^\d{6}$/.test(stock.code) &&
            typeof stock.name === "string"
        )
        .map((stock): KoreanStock => {
          const listedMarket = stock.marketName ?? "";
          const exchange = market.type !== "ETF"
            ? market.exchange
            : /KOSDAQ/i.test(listedMarket)
              ? "KOSDAQ"
              : /KOSPI/i.test(listedMarket)
                ? "KOSPI"
                : market.exchange;
          const preferred =
            market.type !== "ETF" && /우(?:[BC])?$/i.test(stock.name.trim());
          const type = market.type === "ETF"
            ? "ETF"
            : preferred
              ? "PREFERRED"
              : "COMMON";

          return {
            symbol: stock.code,
            name: stock.name,
            exchange,
            type,
          };
        });
      marketStocks.push(...pageStocks);

      if (
        response.continuation.contYn?.toUpperCase() !== "Y" ||
        !response.continuation.nextKey
      ) {
        break;
      }

      if (page === MAX_PAGES - 1) {
        throw new Error(
          `Kiwoom stock list exceeded ${MAX_PAGES} pages: ${market.code}`
        );
      }
      continuation = { ...response.continuation, contYn: "Y" };
    }

    results.push(marketStocks);
  }

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
  if (!q) return [];

  return stocks
    .filter((stock) =>
      stock.symbol.includes(q) ||
      stock.name.toLocaleLowerCase().includes(q)
    )
    .sort((a, b) => {
      const score = (stock: KoreanStock) => {
        const name = stock.name.toLocaleLowerCase();
        return stock.symbol === q || name === q
          ? 0
          : stock.symbol.startsWith(q) || name.startsWith(q)
            ? 1
            : 2;
      };
      return score(a) - score(b) || a.symbol.localeCompare(b.symbol);
    })
    .slice(0, 30);
}
