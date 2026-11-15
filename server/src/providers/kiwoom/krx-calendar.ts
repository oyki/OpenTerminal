
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type KrxMarketSession = {
  date: string;
  isTradingDay: boolean;
  openTime: string | null;
  closeTime: string | null;
  reason: string;
};

type KrxCalendarFile = {
  sessions: KrxMarketSession[];
};

const calendarPath = fileURLToPath(
  new URL("../../../data/krx-calendar.json", import.meta.url)
);

const sessions = new Map<string, KrxMarketSession>();

function loadCalendar(): void {
  const raw = readFileSync(calendarPath, "utf8");
  const data = JSON.parse(raw) as KrxCalendarFile;

  if (!Array.isArray(data.sessions)) {
    throw new Error("Invalid KRX calendar format");
  }

  sessions.clear();


for (const session of data.sessions) {
  validateKrxSession(session);

  if (sessions.has(session.date)) {
    throw new Error(
      `Duplicate KRX calendar date: ${session.date}`
    );
  }

  sessions.set(session.date, session);
}

}

function saveCalendar(): void {
  const data: KrxCalendarFile = {
    sessions: Array.from(sessions.values()).sort(
      (a, b) => a.date.localeCompare(b.date)
    ),
  };

  writeFileSync(
    calendarPath,
    JSON.stringify(data, null, 2) + "\n",
    "utf8"
  );
}

export function getKrxMarketSession(
  date: string
): KrxMarketSession | null {
  return sessions.get(date) ?? null;
}


export function setKrxMarketSession(
  session: KrxMarketSession
): void {
  validateKrxSession(session);

  const previous = sessions.get(session.date);
  sessions.set(session.date, session);

  try {
    saveCalendar();
  } catch (error) {
    if (previous) {
      sessions.set(session.date, previous);
    } else {
      sessions.delete(session.date);
    }
    throw error;
  }
}


loadCalendar();

export function isValidKrxDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const [year, month, day] = date.split("-").map(Number);

  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}


function validateKrxSession(session: KrxMarketSession): void {
  if (!isValidKrxDate(session.date)) {
    throw new Error(`Invalid KRX date: ${session.date}`);
  }

  if (typeof session.isTradingDay !== "boolean") {
    throw new Error(`Invalid trading day flag: ${session.date}`);
  }

  if (typeof session.reason !== "string" ||
      !session.reason.trim()) {
    throw new Error(`Invalid session reason: ${session.date}`);
  }

  const validTime = (time: unknown): time is string => {
    if (typeof time !== "string" ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return false;
    }
    return true;
  };

  if (!session.isTradingDay) {
    if (session.openTime !== null ||
        session.closeTime !== null) {
      throw new Error(
        `Closed KRX session must not have hours: ${session.date}`
      );
    }
    return;
  }

  if (!validTime(session.openTime) ||
      !validTime(session.closeTime)) {
    throw new Error(
      `Invalid KRX trading hours: ${session.date}`
    );
  }

  if (session.openTime >= session.closeTime) {
    throw new Error(
      `KRX opening time must precede closing time: ${session.date}`
    );
  }
}


export function getKrxCalendarCoverage() {
  const allSessions = Array.from(sessions.values());

  const holidays = allSessions.filter(
    (session) => !session.isTradingDay
  );

  const tradingDays = allSessions.filter(
    (session) => session.isTradingDay
  );

  const specialSessions = tradingDays.filter(
    (session) =>
      session.openTime !== "09:00" ||
      session.closeTime !== "15:30"
  );

  return {
    total: allSessions.length,
    holidays: holidays.length,
    tradingDays: tradingDays.length,
    specialSessions: specialSessions.length,
    dates: allSessions
      .map((session) => session.date)
      .sort(),
  };
}

export type KrxMarketStatus = {
  status: "OPEN" | "CLOSED" | "UNKNOWN";
  reason: string;
};

export function evaluateKrxMarketStatus(
  date: string,
  time: string
): KrxMarketStatus {
  if (!isValidKrxDate(date)) {
    throw new Error(`Invalid KRX date: ${date}`);
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error(`Invalid KRX time: ${time}`);
  }

  const session = getKrxMarketSession(date);

  if (!session) {
    const weekday = new Date(
      `${date}T00:00:00Z`
    ).getUTCDay();

    if (weekday === 0 || weekday === 6) {
      return {
        status: "CLOSED",
        reason: "WEEKEND",
      };
    }

    return {
      status: "UNKNOWN",
      reason: "TRADING_CALENDAR_NOT_VERIFIED",
    };
  }

  if (!session.isTradingDay) {
    return {
      status: "CLOSED",
      reason: session.reason,
    };
  }

  if (!session.openTime || !session.closeTime) {
    return {
      status: "UNKNOWN",
      reason: "SESSION_HOURS_NOT_AVAILABLE",
    };
  }

  if (time < session.openTime) {
    return {
      status: "CLOSED",
      reason: "BEFORE_HOURS",
    };
  }

  if (time >= session.closeTime) {
    return {
      status: "CLOSED",
      reason: "AFTER_HOURS",
    };
  }

  return {
    status: "OPEN",
    reason: "REGULAR_SESSION",
  };
}
