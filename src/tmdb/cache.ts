/**
 * Small in-memory TTL cache with LRU eviction.
 * A Map keeps insertion order, so re-inserting on read moves an entry to the end
 * and the first key is always the least recently used one.
 */
export class TtlCache<V> {
  readonly #entries = new Map<string, { value: V; expiresAt: number }>();
  readonly #ttlMs: number;
  readonly #maxEntries: number;
  readonly #now: () => number;

  constructor(ttlMs: number, maxEntries: number, now: () => number = Date.now) {
    this.#ttlMs = ttlMs;
    this.#maxEntries = maxEntries;
    this.#now = now;
  }

  get(key: string): V | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.#now()) {
      this.#entries.delete(key);
      return undefined;
    }
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.#ttlMs === 0 || this.#maxEntries === 0) return;
    this.#entries.delete(key);
    this.#entries.set(key, { value, expiresAt: this.#now() + this.#ttlMs });
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
  }

  get size(): number {
    return this.#entries.size;
  }
}
