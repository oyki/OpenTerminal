
import {
  getKiwoomAccessToken,
  getKiwoomBaseUrl,
  getKiwoomMode,
  type KiwoomMode,
} from "./auth.js";

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
