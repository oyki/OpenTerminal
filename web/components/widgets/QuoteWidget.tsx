"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet, fmt, fmtBig, pctClass, type Quote } from "../../lib/api";
import {
  useTerminal,
  useWidgetSymbol,
  type WidgetInstance,
} from "../../store/terminal";
import Flash from "../Flash";


function fmtPrice(
  value: number | null | undefined,
  isKorea: boolean
): string {
  if (value === null || value === undefined) return "—";

  if (isKorea) {
    return `${value.toLocaleString("ko-KR", {
      maximumFractionDigits: 0,
    })}원`;
  }

  return fmt(value);
}

function quoteChangeClass(
  value: number | null | undefined,
  isKorea: boolean
): string {
  if (value === null || value === undefined) {
    return "dim";
  }

  if (isKorea) {
    if (value > 0) return "text-[#ff3b30]";
    if (value < 0) return "text-[#3478f6]";
    return "dim";
  }

  return pctClass(value);
}

type ShortVolume = { date: string; shortVolume: number; shortExemptVolume: number; totalVolume: number; shortVolumePercent: number };

export default function QuoteWidget({ widget }: { widget: WidgetInstance }) {
  const symbol = useWidgetSymbol(widget);
  const kiwoomMode = useTerminal((s) => s.kiwoomMode);
  const isKorea = /^\d{6}$/.test(symbol);
  const { data, error } = useQuery({
  queryKey: ["quote", symbol, isKorea ? kiwoomMode : "us"],
  queryFn: async (): Promise<Quote> => {
    if (isKorea) {
      const kr = await apiGet<{
        symbol: string;
        name: string | null;
        price: number | null;
        change: number | null;
        changePercent: number | null;
        volume: number | null;
        open: number | null;
        high: number | null;
        low: number | null;
      }>(
        `/api/korea/quotes?symbol=${encodeURIComponent(symbol)}&mode=${kiwoomMode}`
      );

      return {
        symbol: kr.symbol,
        name: kr.name,
        price: kr.price,
        change: kr.change,
        changePercent: kr.changePercent,
        volume: kr.volume,
        open: kr.open,
        high: kr.high,
        low: kr.low,
        previousClose:
          kr.price !== null && kr.change !== null
            ? kr.price - kr.change
            : null,
        bid: null,
        ask: null,
        avgVolume: null,
        marketCap: null,
        pe: null,
        eps: null,
        dividendYield: null,
        week52High: null,
        week52Low: null,
        beta: null,
        sharesOutstanding: null,
        currency: "KRW",
        exchange: "KRX",
        marketState: null,
        source: "kiwoom",
      };
    }

    const quotes = await apiGet<Quote[]>(
      `/api/quotes?symbols=${encodeURIComponent(symbol)}`
    );

    if (!quotes[0]) {
      throw new Error(`Quote not found: ${symbol}`);
    }

    return quotes[0];
  },

  refetchInterval: isKorea ? 5_000 : 1_000,
  retry: false,
});

const { data: shortVol } = useQuery({
  queryKey: ["short-volume", symbol],

  queryFn: () =>
    apiGet<{
      date: string;
      shortVolume: number;
      shortExemptVolume: number;
      totalVolume: number;
      shortVolumePercent: number;
    } | null>(
      `/api/short-volume/${encodeURIComponent(symbol)}`
    ),

  enabled: !isKorea,
  staleTime: 3_600_000,
});

  if (error) {
  return (
    <div className="p-3 down">
      <div className="font-bold">
        {isKorea ? `KRX ${kiwoomMode.toUpperCase()}` : "US"} — 조회 실패
      </div>
      <div className="text-xs mt-2">
        {(error as Error).message}
      </div>
    </div>
  );
}

if (!data) {
  return (
    <div className="p-3 dim">
      {symbol} — {isKorea ? kiwoomMode.toUpperCase() : "US"} 데이터 로딩 중…
    </div>
  );
}

  const rows: Array<[string, string, string?]> = [
    ["Open", fmtPrice(data.open, isKorea)],
    ["High", fmtPrice(data.high, isKorea)],
    ["Low", fmtPrice(data.low, isKorea)],
    ["Prev Close", fmtPrice(data.previousClose, isKorea)],
    ["Bid", fmt(data.bid)],
    ["Ask", fmt(data.ask)],
    ["Volume", fmtBig(data.volume)],
    ["Avg Vol 3M", fmtBig(data.avgVolume)],
    ...(shortVol ? ([["Short Vol %", fmt(shortVol.shortVolumePercent, 1) + "%"]] as Array<[string, string]>) : []),
    ["Mkt Cap", fmtBig(data.marketCap)],
    ["P/E (ttm)", fmt(data.pe)],
    ["EPS (ttm)", fmt(data.eps)],
    ["Div Yield", data.dividendYield !== null ? fmt(data.dividendYield * 100) + "%" : "—"],
    ["52W High", fmt(data.week52High)],
    ["52W Low", fmt(data.week52Low)],
    ["Beta", fmt(data.beta)],
    ["Shares Out", fmtBig(data.sharesOutstanding)],
  ];

  return (
    <div className="p-2">
      <div className="flex items-baseline gap-3 mb-1">
        <Flash
  value={data.price}
  className={`text-xl font-bold ${
    isKorea
      ? quoteChangeClass(data.change, true)
      : ""
  }`}
>
  {fmtPrice(data.price, isKorea)}
</Flash>

<Flash
  value={data.changePercent}
  className={`${quoteChangeClass(
    data.changePercent,
    isKorea
  )} text-sm`}
>
  {data.change !== null && data.change > 0 ? "+" : ""}
  {fmtPrice(data.change, isKorea)}
  {" ("}
  {data.changePercent !== null && data.changePercent > 0
    ? "+"
    : ""}
  {fmt(data.changePercent)}%
  {")"}
</Flash>
        <span className="dim text-[10px] ml-auto">
          {data.exchange ?? ""} · {data.currency ?? ""} · {data.source}
        </span>
      </div>
      <div className="dim text-[11px] mb-2 truncate">{data.name}</div>
      <div className="grid grid-cols-2 gap-x-4">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between border-b border-[#161616] py-0.5">
            <span className="dim">{label}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
