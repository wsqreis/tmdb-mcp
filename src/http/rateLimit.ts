/**
 * Token bucket per client key: each client gets `perMinute` requests that refill continuously.
 * Buckets that have refilled completely carry no state, so they are pruned.
 */
export class RateLimiter {
  readonly #capacity: number;
  readonly #refillPerMs: number;
  readonly #now: () => number;
  readonly #buckets = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(perMinute: number, now: () => number = Date.now) {
    this.#capacity = perMinute;
    this.#refillPerMs = perMinute / 60_000;
    this.#now = now;
  }

  /** Takes one token. Returns 0 if allowed, otherwise the seconds to wait. */
  take(key: string): number {
    if (this.#capacity === 0) return 0; // 0 disables rate limiting
    const now = this.#now();
    const bucket = this.#buckets.get(key) ?? { tokens: this.#capacity, updatedAt: now };
    bucket.tokens = Math.min(this.#capacity, bucket.tokens + (now - bucket.updatedAt) * this.#refillPerMs);
    bucket.updatedAt = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.#buckets.set(key, bucket);
      this.#prune(now);
      return 0;
    }
    this.#buckets.set(key, bucket);
    return Math.ceil((1 - bucket.tokens) / this.#refillPerMs / 1000);
  }

  #prune(now: number): void {
    if (this.#buckets.size < 1000) return;
    for (const [key, bucket] of this.#buckets) {
      if (bucket.tokens + (now - bucket.updatedAt) * this.#refillPerMs >= this.#capacity) {
        this.#buckets.delete(key);
      }
    }
  }
}
