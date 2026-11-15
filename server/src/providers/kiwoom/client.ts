
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
