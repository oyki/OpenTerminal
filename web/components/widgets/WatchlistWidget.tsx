"use client";

import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { apiGet, fmt, fmtBig, pctClass, type Quote } from "../../lib/api";
import { normalizeSymbol, symbolsParam } from "../../lib/symbol";
import { useTerminal } from "../../store/terminal";
import Flash from "../Flash";

type KoreanMarketStatus = {
  market: string;
  status: "OPEN" | "CLOSED" | "UNKNOWN";
  reason: string;
  date: string;
  timezone: string;
  checkedAt: string;
  source: string;
};

export default function WatchlistWidget() {
  const watchlist = useTerminal((s) => s.watchlist);
  const addToWatchlist = useTerminal((s) => s.addToWatchlist);
  const removeFromWatchlist = useTerminal((s) => s.removeFromWatchlist);
  const setActiveSymbol = useTerminal((s) => s.setActiveSymbol);
  const kiwoomMode = useTerminal((s) => s.kiwoomMode);

  const usSymbols = watchlist.filter((s) => !/^\d{6}$/.test(s));
  const krSymbols = watchlist.filter((s) => /^\d{6}$/.test(s));
  const [input, setInput] = useState("");
  const [invalid, setInvalid] = useState(false);
  const lastKrQuotes = useRef<Record<string, Quote>>({});
  const lastKrUpdated = useRef<Record<string, number>>({});

  const { data: marketData } = useQuery({
    queryKey: ["krx-market-status"],
    queryFn: () =>
      apiGet<KoreanMarketStatus>("/api/korea/market-status"),
    enabled: krSymbols.length > 0,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });

  const marketStatus = marketData?.status ?? "UNKNOWN";

  const [staleSymbols, setStaleSymbols] = useState<string[]>([]);

  const { data: usData = [] } = useQuery({
  queryKey: ["watchlist-us", usSymbols.join(",")],
  queryFn: () =>
    apiGet<Quote[]>(`/api/quotes?symbols=${symbolsParam(usSymbols)}`),
  enabled: usSymbols.length > 0,
  refetchInterval: 1_000,
});

const { data: krData } = useQuery({
  queryKey: ["watchlist-kr-v2", krSymbols.join(","), kiwoomMode],
  queryFn: async () => {
    const results = await Promise.allSettled(
      krSymbols.map((symbol) =>
        apiGet<Quote>(
          `/api/korea/quotes?symbol=${symbol}&mode=${kiwoomMode}`
        )
      )
    );

    const stale: string[] = [];

    const quotes = results.flatMap((result, index) => {
      const symbol = krSymbols[index];
      const cacheKey = `${kiwoomMode}:${symbol}`;

      if (result.status === "fulfilled") {
  lastKrQuotes.current[cacheKey] = result.value;
  lastKrUpdated.current[cacheKey] = Date.now();
  return [result.value];
      }

      stale.push(symbol);

      console.warn(
        `Watchlist quote temporarily unavailable: ${symbol} (${kiwoomMode})`
      );

      const previous = lastKrQuotes.current[cacheKey];
      return previous ? [previous] : [];
    });

    return { quotes, stale };
  },
  enabled: krSymbols.length > 0,
  staleTime: 10_000,
  refetchInterval: 30_000,
  retry: false,
});


const data: Quote[] = [
  ...usData,
  ...(krData?.quotes ?? []),
];

  return (
    <div>
      <form
        className="flex gap-1 p-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim()) return;
          const sym = normalizeSymbol(input);
          if (!sym) {
            setInvalid(true);
            return;
          }
          addToWatchlist(sym);
          setInput("");
        }}
      >
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setInvalid(false);
          }}
          placeholder="Add ticker…"
          title={invalid ? "Not a valid ticker symbol" : undefined}
          aria-invalid={invalid}
          className={`flex-1 ${invalid ? "!border-[var(--down)]" : ""}`}
        />
        <button className="term-btn" type="submit">+</button>
      </form>
      <table className="data-table">
        <thead>
          <tr><th>Sym</th><th>Last</th><th>Chg%</th><th>Vol</th><th></th></tr>
        </thead>
        <tbody>
          {watchlist.map((sym) => {
            const q = data.find((d) => d.symbol === sym);
            return (
              <tr key={sym} onClick={() => setActiveSymbol(sym)}>
                <td className="font-bold">
  <div className="flex items-center gap-1">
    <span>{sym}</span>


{/^\d{6}$/.test(sym) && (() => {
  const isLoading = !krData;
  const isStale = krData?.stale?.includes(sym) ?? false;
  const hasQuote =
    krData?.quotes?.some((q) => q.symbol === sym) ?? false;

  const updatedAt = lastKrUpdated.current[`${kiwoomMode}:${sym}`];

  const updatedText = updatedAt
  ? new Date(updatedAt).toLocaleTimeString("ko-KR", {
      hour12: false,
    })
  : "Not available";
  const status = isLoading
    ? "LOADING"
    : isStale || !hasQuote
      ? "STALE"
      : "LIVE";

return (
  <>
    <span
      className={
        status === "LIVE"
          ? "text-[var(--up)] text-[9px]"
          : "text-[var(--amber)] text-[9px]"
      }
      title={`${status} · Last successful update: ${updatedText}`}
    >
      {status}
    </span>

    <span

      className={
        marketStatus === "OPEN"
          ? "text-[var(--up)] text-[9px]"
          : marketStatus === "CLOSED"
            ? "text-[var(--muted)] text-[9px]"
            : "text-[var(--amber)] text-[9px]"
      }

      title="KRX regular-session schedule (holidays not included)"
    >
          {marketStatus === "OPEN"
      ? "MARKET OPEN"
      : marketStatus === "CLOSED"
        ? "MARKET CLOSED"
        : "MARKET UNKNOWN"}

    </span>
  </>
);

})()}

  </div>
</td>
                <td><Flash value={q?.price}>{fmt(q?.price)}</Flash></td>
                <td className={pctClass(q?.changePercent)}>
                  <Flash value={q?.changePercent}>{fmt(q?.changePercent)}%</Flash>
                </td>
                <td>{fmtBig(q?.volume)}</td>
                <td>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromWatchlist(sym);
                    }}
                    className="dim hover:text-[var(--down)]"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
