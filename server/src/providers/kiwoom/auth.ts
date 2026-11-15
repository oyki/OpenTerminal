
export type KiwoomMode = "demo" | "real";

const tokenCache = new Map<
  KiwoomMode,
  { token: string; expiresAt: number }
>();

const pendingTokens = new Map<KiwoomMode, Promise<string>>();

export function isKiwoomMode(
  value: unknown
): value is KiwoomMode {
  return value === "real" || value === "demo";
}

export function getKiwoomMode(): KiwoomMode {
  const mode = process.env.KIWOOM_MODE ?? "demo";

  if (!isKiwoomMode(mode)) {
    throw new Error("KIWOOM_MODE must be demo or real");
  }

  return mode;
}

export function getKiwoomBaseUrl(
  mode: KiwoomMode = getKiwoomMode()
): string {
  return mode === "real"
    ? "https://api.kiwoom.com"
    : "https://mockapi.kiwoom.com";
}

function getCredentials(mode: KiwoomMode) {
  const appkey =
    mode === "real"
      ? process.env.KIWOOM_APP_KEY
      : process.env.KIWOOM_APP_KEY_MOCK;

  const secretkey =
    mode === "real"
      ? process.env.KIWOOM_SECRET_KEY
      : process.env.KIWOOM_SECRET_KEY_MOCK;

  if (!appkey || !secretkey) {
    throw new Error(
      `Kiwoom ${mode} credentials are not configured`
    );
  }

  return { appkey, secretkey };
}

function parseExpiry(value: string): number {
  if (!/^\d{14}$/.test(value)) {
    throw new Error("Invalid Kiwoom token expiry");
  }

  const iso =
    `${value.slice(0, 4)}-${value.slice(4, 6)}-` +
    `${value.slice(6, 8)}T${value.slice(8, 10)}:` +
    `${value.slice(10, 12)}:${value.slice(12, 14)}+09:00`;

  const timestamp = Date.parse(iso);

  if (!Number.isFinite(timestamp)) {
    throw new Error("Invalid Kiwoom token expiry");
  }

  return timestamp;
}

export async function getKiwoomAccessToken(
  mode: KiwoomMode = getKiwoomMode()
): Promise<string> {
  const cached = tokenCache.get(mode);

  if (cached && Date.now() < cached.expiresAt - 600_000) {
    return cached.token;
  }

  const pending = pendingTokens.get(mode);
  if (pending) return pending;

  const request = (async () => {
    const credentials = getCredentials(mode);

    const response = await fetch(
      `${getKiwoomBaseUrl(mode)}/oauth2/token`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json;charset=UTF-8",
        },
        body: JSON.stringify({
          grant_type: "client_credentials",
          ...credentials,
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Kiwoom ${mode} authentication HTTP ${response.status}`
      );
    }

    const result = (await response.json()) as {
      return_code?: number | string;
      token?: string;
      expires_dt?: string;
    };

    if (
      Number(result.return_code ?? 0) !== 0 ||
      !result.token ||
      !result.expires_dt
    ) {
      throw new Error(
        `Kiwoom ${mode} authentication failed`
      );
    }

    const expiresAt = parseExpiry(result.expires_dt);

    if (expiresAt <= Date.now() + 600_000) {
      throw new Error("Kiwoom token expiry is too close");
    }

    tokenCache.set(mode, {
      token: result.token,
      expiresAt,
    });

    return result.token;
  })();

  pendingTokens.set(mode, request);

  try {
    return await request;
  } finally {
    pendingTokens.delete(mode);
  }
}
