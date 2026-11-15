
import { kiwoomPost } from "./client.js";
import {
  getKiwoomMode,
  type KiwoomMode,
} from "./auth.js";

export type KrxIndexCode = "001" | "101";

export const KRX_INDICES = {
  "001": {
    name: "KOSPI",
    marketType: "0",
  },
  "101": {
    name: "KOSDAQ",
    marketType: "1",
  },
} as const;

type KiwoomIndexResponse = Record<string, unknown> & {
  cur_prc?: string;
  pred_pre?: string;
  pred_pre_sig?: string;
  flu_rt?: string;
  open_pric?: string;
  high_pric?: string;
  low_pric?: string;
  trde_qty?: string;
  trde_prica?: string;
};

function parseNumber(
  value: unknown,
  absolute = false
): number | null {
  if (typeof value !== "string" &&
      typeof value !== "number") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return absolute ? Math.abs(parsed) : parsed;
}

export async function getKrxIndex(
  code: KrxIndexCode,
  mode: KiwoomMode = getKiwoomMode()
) {
  const index = KRX_INDICES[code];

  const raw = await kiwoomPost<KiwoomIndexResponse>(
    "ka20001",
    "/api/dostk/sect",
    {
      mrkt_tp: index.marketType,
      inds_cd: code,
    },
    mode
  );

  const price = parseNumber(raw.cur_prc, true);

  if (price === null || price <= 0) {
    throw new Error(
      `Invalid ${index.name} index price`
    );
  }

const change = parseNumber(raw.pred_pre);
const changePercent = parseNumber(raw.flu_rt);
const changeSign = raw.pred_pre_sig ?? null;

// 전일 대비와 등락률의 일관성 검사
if (change !== null && changePercent !== null) {
  const previousClose = price - change;

  if (previousClose <= 0) {
    throw new Error(
      `Invalid ${index.name} previous close`
    );
  }

  const expectedPercent =
    (change / previousClose) * 100;

  // 등락률의 반올림 오차를 고려하여 0.1%p 허용
  if (
    Math.abs(expectedPercent - changePercent) > 0.1
  ) {
    throw new Error(
      `Inconsistent ${index.name} index change`
    );
  }
}

// 확인된 키움 등락 기호: 2=상승, 5=하락
if (
  (changeSign === "2" && change !== null && change < 0) ||
  (changeSign === "5" && change !== null && change > 0)
) {
  throw new Error(
    `Inconsistent ${index.name} change sign`
  );
}

return {
  code,
  name: index.name,
  mode,
  checkedAt: new Date().toISOString(),
  price,
  change,
  changePercent,
  changeSign,
  open: parseNumber(raw.open_pric, true),
  high: parseNumber(raw.high_pric, true),
  low: parseNumber(raw.low_pric, true),
  volume: parseNumber(raw.trde_qty, true),
  tradingValue: parseNumber(raw.trde_prica, true),
  source: "KIWOOM_REST",
};
}
