// Retry transient GET failures only. Never automatically repeat orders,
// payments, or other writes: doing so could duplicate real transactions.
const transientStatuses = new Set([429, 502, 503, 504]);
const delay = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(new DOMException("Request cancelled", "AbortError")); return; }
  const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
  const onAbort = () => {
    clearTimeout(timer);
    reject(new DOMException("Request cancelled", "AbortError"));
  };
  signal?.addEventListener("abort", onAbort, { once: true });
});

export class ApiFetchError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "ApiFetchError"; }
}

export async function fetchMarketplaceGet<T>(
  path: string,
  options: { signal?: AbortSignal; retries?: number } = {},
): Promise<T> {
  const { signal, retries = 2 } = options;
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(path, {
        credentials: "include",
        cache: "no-store",
        signal,
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        if (!(response.headers.get("content-type") || "").includes("application/json"))
          throw new ApiFetchError("The service returned an unexpected response. Please retry.", 502);
        return await response.json() as T;
      }
      if (!transientStatuses.has(response.status) || attempt >= retries) {
        const messages: Record<number, string> = {
          429: "The marketplace is receiving too many requests. Please try again shortly.",
          502: "The marketplace service is temporarily unreachable.",
          503: "The marketplace is temporarily unavailable.",
          504: "The marketplace service took too long to respond.",
        };
        throw new ApiFetchError(messages[response.status] || `Marketplace request failed (HTTP ${response.status}).`, response.status);
      }
      const retryAfter = response.headers.get("retry-after");
      const seconds = retryAfter ? Number(retryAfter) : NaN;
      const wait = Number.isFinite(seconds) && seconds >= 0
        ? Math.min(6000, seconds * 1000)
        : Math.min(6000, 700 * (2 ** attempt));
      await delay(wait, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error instanceof ApiFetchError) throw error;
      if (attempt >= retries) throw new Error("Unable to connect to GURA. Check your connection and retry.");
      await delay(Math.min(6000, 700 * (2 ** attempt)), signal);
    }
  }
}
