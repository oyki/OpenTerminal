
import {
  getKiwoomAccessToken,
  getKiwoomBaseUrl,
  getKiwoomMode,
  type KiwoomMode,
} from "./auth.js";

export type KiwoomContinuation = {
  contYn: string | null;
  nextKey: string | null;
};

const nextRequestAtByMode = new Map<KiwoomMode, number>();
const nextRequestAtByTr = new Map<string, number>();

async function waitForRequestSlot(
  mode: KiwoomMode,
  apiId: string
): Promise<void> {
  const trKey = `${mode}:${apiId}`;
  const now = Date.now();
  const globalInterval = 200;
  const trInterval = mode === "demo" ? 1000 : 200;
  const scheduledAt = Math.max(
    now,
    nextRequestAtByMode.get(mode) ?? now,
    nextRequestAtByTr.get(trKey) ?? now
  );
  nextRequestAtByMode.set(mode, scheduledAt + globalInterval);
  nextRequestAtByTr.set(trKey, scheduledAt + trInterval);

  const delay = scheduledAt - now;
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export async function kiwoomPostPage<
  T extends Record<string, unknown>
>(
  apiId: string,
  path: string,
  body: Record<string, string>,
  mode: KiwoomMode = getKiwoomMode(),
  continuation?: KiwoomContinuation
): Promise<{ data: T; continuation: KiwoomContinuation }> {
  const token = await getKiwoomAccessToken(mode);
  await waitForRequestSlot(mode, apiId);
  const headers: Record<string, string> = {
    "Content-Type": "application/json;charset=UTF-8",
    authorization: `Bearer ${token}`,
    "api-id": apiId,
  };
  if (continuation?.contYn) headers["cont-yn"] = continuation.contYn;
  if (continuation?.nextKey) headers["next-key"] = continuation.nextKey;

  const response = await fetch(`${getKiwoomBaseUrl(mode)}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Kiwoom ${mode} API HTTP ${response.status}`);
  }

  const data = (await response.json()) as T & {
    return_code?: number | string;
    return_msg?: string;
  };
  if (Number(data.return_code ?? 0) !== 0) {
    throw new Error(
      `Kiwoom ${mode} API ${data.return_code}: ${data.return_msg ?? "Request failed"}`
    );
  }

  return {
    data,
    continuation: {
      contYn: response.headers.get("cont-yn"),
      nextKey: response.headers.get("next-key"),
    },
  };
}

export async function kiwoomPost<
  T extends Record<string, unknown>
>(
  apiId: string,
  path: string,
  body: Record<string, string>,
  mode: KiwoomMode = getKiwoomMode()
): Promise<T> {
  const token = await getKiwoomAccessToken(mode);
  await waitForRequestSlot(mode, apiId);

  const response = await fetch(
    `${getKiwoomBaseUrl(mode)}${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json;charset=UTF-8",
        authorization: `Bearer ${token}`,
        "api-id": apiId,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Kiwoom ${mode} API HTTP ${response.status}`
    );
  }

  const result = (await response.json()) as T & {
    return_code?: number | string;
    return_msg?: string;
  };

  if (Number(result.return_code ?? 0) !== 0) {
    throw new Error(
      `Kiwoom ${mode} API ${result.return_code}: ` +
      `${result.return_msg ?? "Request failed"}`
    );
  }

  return result;
}
