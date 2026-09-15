export type ApiResult<T> = {
  ok: boolean;
  status: number;
  data: T & { error?: string; code?: string };
  timedOut?: boolean;
};

// Every request carries its own abort timer so a stalled server turns into a
// message the user can act on instead of a spinner that never stops.
export async function requestJson<T = Record<string, unknown>>(
  url: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {}
): Promise<ApiResult<T>> {
  const { method = "POST", body, timeoutMs = 45_000 } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as T & {
      error?: string;
      code?: string;
    };
    if (response.status === 403 && data.code === "EMAIL_NOT_VERIFIED") {
      window.location.assign("/verify");
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      status: 0,
      timedOut: aborted,
      data: {
        error: aborted
          ? "Сервер долго не отвечает. Попробуйте ещё раз."
          : "Нет связи с сервером.",
      } as T & { error?: string },
    };
  } finally {
    clearTimeout(timer);
  }
}

export function postJson<T = Record<string, unknown>>(url: string, body?: unknown, timeoutMs?: number) {
  return requestJson<T>(url, { method: "POST", body, timeoutMs });
}
