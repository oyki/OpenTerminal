

import { useQuery } from "@tanstack/react-query";
import { apiGet, fmt, pctClass } from "../../lib/api";
import { useTerminal } from "../../store/terminal";

type KiwoomMode = "real" | "demo";

type KrxIndexData = {
  code: string;
  name: string;
  mode: KiwoomMode;
  price: number;
  change: number | null;
  changePercent: number | null;
  changeSign: string | null;
  source: string;
  checkedAt?: string;
};

type KrxMarketStatus = {
  market: string;
  status: "OPEN" | "CLOSED" | "UNKNOWN";
  reason: string;
  date: string;
  timezone: string;
  checkedAt: string;
  source: string;
  calendarVerified: boolean;
};

function formatKst(value?: string | null): string {
  if (!value) return "Unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function IndexRow({
  name,
  data,
  loading,
  error,
}: {
  name: string;
  data?: KrxIndexData;
  loading: boolean;
  error: Error | null;
}) {
  if (error) {
    return (
      <tr>
        <td>{name}</td>
        <td colSpan={2} className="down">
          {error.message}
        </td>
      </tr>
    );
  }

  if (loading || !data) {
    return (
      <tr>
        <td>{name}</td>
        <td colSpan={2} className="dim">
          Loading...
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="font-semibold">{name}</td>

      <td>{fmt(data.price, 2)}</td>

      <td className={pctClass(data.changePercent)}>
        {data.changePercent === null
          ? "—"
          : `${data.changePercent > 0 ? "+" : ""}${fmt(
              data.changePercent,
              2
            )}%`}
      </td>
    </tr>
  );
}


export default function KrxIndicesWidget() {
  const mode = useTerminal((s) => s.kiwoomMode);
  const setMode = useTerminal((s) => s.setKiwoomMode);

  // KOSPI 지수 조회
  const kospi = useQuery({
    queryKey: ["krx-index", "001", mode],
    queryFn: () =>
      apiGet<KrxIndexData>(
        `/api/korea/indices?code=001&mode=${mode}`
      ),
    refetchInterval: 60_000,
    retry: 1,
  });

  // KOSDAQ 지수 조회
  const kosdaq = useQuery({
    queryKey: ["krx-index", "101", mode],
    queryFn: () =>
      apiGet<KrxIndexData>(
        `/api/korea/indices?code=101&mode=${mode}`
      ),
    refetchInterval: 60_000,
    retry: 1,
  });

  // KRX 거래상태 조회
  const marketStatus = useQuery({
    queryKey: ["krx-market-status"],
    queryFn: () =>
      apiGet<KrxMarketStatus>("/api/korea/market-status"),
    refetchInterval: 60_000,
    retry: 1,
  });

  const status = marketStatus.data;

  return (
    <div>
      {/* REAL / DEMO 선택 */}
      <div className="flex items-center justify-between p-2">
        <span className="dim text-[10px]">
          Korea Exchange
        </span>

        <div className="flex gap-1">
          {(["real", "demo"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`term-btn ${
                mode === value ? "active" : ""
              }`}
              onClick={() => setMode(value)}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* KRX 시장 거래상태 */}
      <div className="flex items-center justify-between px-2 pb-2 text-[10px]">
        <span className="dim">KRX Market Status</span>

        {status ? (
          <span
            title={`Reason: ${status.reason} | Calendar entry: ${
              status.calendarVerified ? "registered" : "not registered"
            }`}
            className={
              status.status === "OPEN"
                ? "text-[var(--up)]"
                : status.status === "CLOSED"
                  ? "dim"
                  : "text-[var(--amber)]"
            }
          >
            {status.status} · {status.reason}
          </span>
        ) : marketStatus.isError ? (
          <span className="down">Status unavailable</span>
        ) : (
          <span className="dim">Checking...</span>
        )}
      </div>

      {/* 지수 데이터 */}
      <table className="data-table">
        <thead>
          <tr>
            <th>Index</th>
            <th>Last</th>
            <th>Chg%</th>
          </tr>
        </thead>

        <tbody>
          <IndexRow
            name="KOSPI"
            data={kospi.data}
            loading={kospi.isPending}
            error={kospi.error}
          />

          <IndexRow
            name="KOSDAQ"
            data={kosdaq.data}
            loading={kosdaq.isPending}
            error={kosdaq.error}
          />
        </tbody>
      </table>

      <div className="border-t border-[var(--border)] px-2 py-2 text-[10px] dim">
        <div className="flex justify-between">
          <span>KOSPI checked</span>
          <span>{formatKst(kospi.data?.checkedAt)} KST</span>
        </div>

        <div className="flex justify-between">
          <span>KOSDAQ checked</span>
          <span>{formatKst(kosdaq.data?.checkedAt)} KST</span>
        </div>

        <div className="flex justify-between">
          <span>Market status checked</span>
          <span>{formatKst(status?.checkedAt)} KST</span>
        </div>

        <div className="mt-1">
          Price data timestamp: Not provided by API
        </div>
      </div>

      <div className="flex justify-between p-2 text-[10px] dim">
        <span>Source: Kiwoom REST</span>
        <span>
          {kospi.isFetching || kosdaq.isFetching
            ? "Updating..."
            : "Refresh: 60s"}
        </span>
      </div>
    </div>
  );
}
