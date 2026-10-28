const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createLimiter(limit = 4) {
  let active = 0;
  const queue = [];
  const run = () => {
    if (active >= limit || !queue.length) return;
    const { operation, resolve, reject } = queue.shift();
    active++;
    Promise.resolve()
      .then(operation)
      .then(resolve, reject)
      .finally(() => {
        active--;
        run();
      });
    run();
  };
  return (operation) =>
    new Promise((resolve, reject) => {
      queue.push({ operation, resolve, reject });
      run();
    });
}
const limit = createLimiter(4);
const cooldowns = new Map();
export async function fetchReliable(url, options = {}, { retries = 2, timeoutMs = 10000, wait = sleep } = {}) {
  return limit(async () => {
    const origin = new URL(url).origin;
    const remaining = (cooldowns.get(origin) || 0) - Date.now();
    if (remaining > 0) {
      const error = new Error("Service rate limit is active. Please retry later.");
      error.status = 429;
      error.retryAfter = remaining;
      throw error;
    }
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const abort = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted) abort();
      let timeout;
      const deadline = new Promise((resolve, reject) => {
        timeout = setTimeout(() => {
          const error = new Error("Request timed out");
          controller.abort(error);
          reject(error);
        }, timeoutMs);
      });
      let delay = 250 * 2 ** attempt;
      try {
        // Keep the timeout active while reading the body as well as headers.
        const response = await Promise.race([
          deadline,
          (async () => {
            const raw = await fetch(url, { ...options, signal: controller.signal });
            const body = await raw.arrayBuffer();
            return new Response(raw.status === 204 || raw.status === 205 || raw.status === 304 ? null : body, {
              status: raw.status,
              statusText: raw.statusText,
              headers: raw.headers,
            });
          })(),
        ]);
        if (response.ok) return response;
        const retryAfter = response.headers?.get("Retry-After");
        if (retryAfter)
          delay = /^\d+$/.test(retryAfter)
            ? Number(retryAfter) * 1000
            : Math.max(0, Date.parse(retryAfter) - Date.now());
        if (!Number.isFinite(delay)) delay = 250 * 2 ** attempt;
        if (response.status === 429) cooldowns.set(origin, Date.now() + delay);
        const error = new Error(`Request failed (${response.status})`);
        error.status = response.status;
        error.retryable = response.status === 429 || response.status >= 500;
        // Never retry earlier than Retry-After. Long delays are returned to the UI.
        error.retryAfter = delay;
        throw error;
      } catch (error) {
        if (options.signal?.aborted || attempt >= retries || delay > 30000 || (error.status && !error.retryable))
          throw error;
      } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", abort);
      }
      await wait(delay);
    }
  });
}

// Coalesce in-flight calls. Expired data is returned only with an explicit stale
// marker after a failed refresh; callers must label it in the UI.
export class TtlCache {
  constructor(ttl = 3600000, now = Date.now) {
    this.ttl = ttl;
    this.now = now;
    this.entries = new Map();
    this.pending = new Map();
  }
  async get(key, load) {
    const entry = this.entries.get(key);
    if (entry && entry.expires > this.now()) return entry.value;
    if (this.pending.has(key)) return this.pending.get(key);
    const pending = Promise.resolve()
      .then(load)
      .then((value) => {
        this.entries.set(key, { value, expires: this.now() + this.ttl });
        if (this.entries.size > 500) this.entries.delete(this.entries.keys().next().value);
        return value;
      })
      .catch((error) => {
        if (entry?.value && typeof entry.value === "object")
          return Array.isArray(entry.value)
            ? Object.assign([...entry.value], { stale: true })
            : { ...entry.value, stale: true };
        throw error;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, pending);
    return pending;
  }
}
