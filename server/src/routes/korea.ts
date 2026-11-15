
import { Router } from "express";
import { kiwoomPost } from "../providers/kiwoom/client.js";

import {
  getKrxMarketSession,
  getKrxCalendarCoverage,
  isValidKrxDate,
  evaluateKrxMarketStatus,
} from "../providers/kiwoom/krx-calendar.js";

import {
  getKiwoomMode,
  isKiwoomMode,
  type KiwoomMode,
} from "../providers/kiwoom/auth.js";

import {
  getKrxIndex,
  type KrxIndexCode,
} from "../providers/kiwoom/indices.js";
import { getKoreanStockList, searchKoreanStocks } from "../providers/kiwoom/stock-list.js";

export const koreaRouter = Router();

koreaRouter.get("/stocks", async (req, res) => {
  const mode = resolveMode(req.query.mode);
  if (mode === null) {
    res.status(400).json({ error: "mode must be real or demo" });
    return;
  }
  const market = req.query.market;
  if (market !== undefined && market !== "KOSPI" && market !== "KOSDAQ") {
    res.status(400).json({ error: "market must be KOSPI or KOSDAQ" });
    return;
  }
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const stocks = q ? await searchKoreanStocks(q, mode) : await getKoreanStockList(mode);
    res.json(market ? stocks.filter((stock) => stock.exchange === market) : stocks);
  } catch (error) {
    console.error(`Kiwoom ${mode} stock list request failed:`, error instanceof Error ? error.message : "Unknown error");
    res.status(502).json({ error: `Kiwoom ${mode} stock list request failed; check server logs` });
  }
});

type KiwoomStockInfo = {
  stk_cd?: string;
  stk_nm?: string;
  cur_prc?: string;
  pred_pre?: string;
  flu_rt?: string;
  trde_qty?: string;
  open_pric?: string;
  high_pric?: string;
  low_pric?: string;
  return_code?: number | string;
};

type KiwoomDailyRow = {
  dt?: string;
  cur_prc?: string;
  open_pric?: string;
  high_pric?: string;
  low_pric?: string;
  trde_qty?: string;
};

type KiwoomDailyResponse = {
  stk_cd?: string;
  stk_dt_pole_chart_qry?: KiwoomDailyRow[];
  return_code?: number | string;
};

function numeric(value: string | undefined): number | null {
  if (!value) return null;

  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function price(value: string | undefined): number | null {
  const parsed = numeric(value);
  return parsed === null ? null : Math.abs(parsed);
}

function resolveMode(value: unknown): KiwoomMode | null {
  if (value === undefined) return getKiwoomMode();
  return isKiwoomMode(value) ? value : null;
}

koreaRouter.get("/quotes", async (req, res) => {
  const symbol = req.query.symbol;
  const mode = resolveMode(req.query.mode);

  if (mode === null) {
    res.status(400).json({
      error: "mode must be real or demo",
    });
    return;
  }

  if (typeof symbol !== "string" || !/^\d{6}$/.test(symbol)) {
    res.status(400).json({
      error: "symbol must be a six-digit KRX code",
    });
    return;
  }

  try {
    const data = await kiwoomPost<KiwoomStockInfo>(
      "ka10001",
      "/api/dostk/stkinfo",
      { stk_cd: symbol },
      mode
    );

    res.json({
      symbol,
      name: data.stk_nm ?? null,
      checkedAt: new Date().toISOString(),
      price: price(data.cur_prc),
      change: numeric(data.pred_pre),
      changePercent: numeric(data.flu_rt),
      volume: numeric(data.trde_qty),
      open: price(data.open_pric),
      high: price(data.high_pric),
      low: price(data.low_pric),
      rawPrice: data.cur_prc ?? null,
      rawChange: data.pred_pre ?? null,
      currency: "KRW",
      market: "KRX",
      mode,
      source: "kiwoom",
    });
  } catch (error) {
    console.error(
      `Kiwoom ${mode} quote request failed:`,
      error instanceof Error ? error.message : "Unknown error"
    );

    res.status(502).json({
      error: `Kiwoom ${mode} quote request failed; check server logs`,
    });
  }
});

koreaRouter.get("/history/:symbol", async (req, res) => {
  const { symbol } = req.params;
  const mode = resolveMode(req.query.mode);

  if (mode === null) {
    res.status(400).json({
      error: "mode must be real or demo",
    });
    return;
  }

  if (!/^\d{6}$/.test(symbol)) {
    res.status(400).json({
      error: "Invalid KRX symbol",
    });

    return;
  }

  const requestedDate = req.query.date;

  const todayKst = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");

  const baseDate =
    typeof requestedDate === "string"
      ? requestedDate
      : todayKst;

  if (
    !/^\d{8}$/.test(baseDate) ||
    !Number.isFinite(
      Date.parse(
        `${baseDate.slice(0, 4)}-${baseDate.slice(4, 6)}-` +
        `${baseDate.slice(6, 8)}T00:00:00Z`
      )
    )
  ) {
    res.status(400).json({
      error: "Invalid date; use YYYYMMDD",
    });
    return;
  }

  try {
    const data = await kiwoomPost<KiwoomDailyResponse>(
      "ka10081",
      "/api/dostk/chart",
      {
        stk_cd: symbol,
        base_dt: baseDate,
        upd_stkpc_tp: "1",
      },
      mode
    );

    const candles = (data.stk_dt_pole_chart_qry ?? [])
      .map((row) => {
        const open = price(row.open_pric);
        const high = price(row.high_pric);
        const low = price(row.low_pric);
        const close = price(row.cur_prc);
        const volume = numeric(row.trde_qty);

        if (
          !row.dt ||
          !/^\d{8}$/.test(row.dt) ||
          open === null ||
          high === null ||
          low === null ||
          close === null ||
          volume === null
        ) {
          return null;
        }

        return {
          time:
            `${row.dt.slice(0, 4)}-` +
            `${row.dt.slice(4, 6)}-` +
            `${row.dt.slice(6, 8)}`,
          open,
          high,
          low,
          close,
          volume: Math.abs(volume),
        };
      })
      .filter((row) => row !== null)
      .sort((a, b) => a.time.localeCompare(b.time));

    res.json({
      symbol,
      market: "KRX",
      currency: "KRW",
      interval: "1d",
      adjusted: true,
      checkedAt: new Date().toISOString(),
      candles,
      count: candles.length,
      mode,
      source: "kiwoom",
    });
  } catch (error) {
    console.error(
      `Kiwoom ${mode} daily history failed:`,
      error instanceof Error ? error.message : "Unknown error"
    );

    res.status(502).json({
      error: `Kiwoom ${mode} daily history request failed; check server logs`,
    });
  }
});

koreaRouter.get("/market-calendar", (req, res) => {
  const date = req.query.date;

  if (typeof date !== "string" || !isValidKrxDate(date)) {
    res.status(400).json({
      error: "date must be YYYY-MM-DD",
    });
    return;
  }

  const session = getKrxMarketSession(date);

  if (!session) {
    res.json({
      market: "KRX",
      date,
      calendarVerified: false,
      session: null,
    });
    return;
  }

  res.json({
    market: "KRX",
    date,
    calendarVerified: true,
    session,
  });
});


koreaRouter.get("/market-status", (_req, res) => {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const date =
    `${getPart("year")}-${getPart("month")}-${getPart("day")}`;

  const time =
    `${getPart("hour")}:${getPart("minute")}`;

  // KRX 거래상태 판정 함수 사용
  const { status, reason } =
    evaluateKrxMarketStatus(date, time);

  // 등록된 거래일 정보 확인
  const session = getKrxMarketSession(date);

  res.json({
    market: "KRX",
    status,
    reason,
    date,
    timezone: "Asia/Seoul",
    checkedAt: now.toISOString(),
    source: session ? "calendar" : "schedule",
    calendarVerified: session !== null,
  });
});


koreaRouter.get("/market-calendar/coverage", (_req, res) => {
  const coverage = getKrxCalendarCoverage();

  res.json({
    market: "KRX",
    timezone: "Asia/Seoul",
    ...coverage,
    source: "local-calendar",
    officialCalendarComplete: false,
  });
});

koreaRouter.get("/indices", async (req, res) => {
  try {
    const code = String(req.query.code ?? "001");
    const requestedMode = req.query.mode;

    if (code !== "001" && code !== "101") {
      res.status(400).json({
        error: "INVALID_INDEX_CODE",
        message: "Supported codes: 001, 101",
      });
      return;
    }

    if (
      requestedMode !== undefined &&
      (typeof requestedMode !== "string" ||
        !isKiwoomMode(requestedMode))
    ) {
      res.status(400).json({
        error: "INVALID_MODE",
        message: "Supported modes: real, demo",
      });
      return;
    }

    const mode =
      typeof requestedMode === "string"
        ? (requestedMode as KiwoomMode)
        : getKiwoomMode();

    const result = await getKrxIndex(
      code as KrxIndexCode,
      mode
    );

    res.json(result);
  } catch (error) {
    console.error("KRX index request failed:", error);

    res.status(502).json({
      error: "KIWOOM_INDEX_REQUEST_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Unknown error",
    });
  }
});
