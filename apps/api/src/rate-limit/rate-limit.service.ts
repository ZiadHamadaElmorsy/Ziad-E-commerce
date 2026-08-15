import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

export interface RateLimitDecision {
  allowed: boolean;
  /** Milliseconds the client must wait before retrying (0 when allowed). */
  retryAfterMs: number;
}

interface BucketState {
  /** Timestamps (ms epoch) of accepted requests within the current window. */
  hits: number[];
  lastSeen: number;
}

/** Keys untouched for this long are pruned (bounded memory in long runs). */
const PRUNE_IDLE_MS = 10 * 60 * 1000;
/** How often the prune pass runs (unref'd timer — never blocks shutdown). */
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * In-memory sliding-window rate limiter (Phase 21).
 *
 * - Keyed by `ip:bucket` so one client cannot exhaust another bucket and one
 *   client cannot consume another client's budget.
 * - Uses a sliding window of request timestamps per key (bounded, pruned).
 * - Single-process deployment: adequate for the pilot. Horizontal scale-out
 *   requires replacing the Map with a shared store (Redis) behind the same
 *   interface — documented in the phase report.
 * - Phase 23: a periodic unref'd prune removes idle keys so a long-running
 *   production process keeps bounded memory.
 *
 * The service is deliberately dependency-free (no Redis/DB) so it works in
 * any deployment and is trivially unit-testable.
 */
@Injectable()
export class RateLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly buckets = new Map<string, BucketState>();
  private timer: NodeJS.Timeout | undefined;

  onModuleInit(): void {
    // Prune idle keys in the background. `unref()` keeps the process free to
    // exit; the timer is cleared on module destroy.
    this.timer = setInterval(() => {
      const removed = this.pruneIdle(PRUNE_IDLE_MS);
      if (removed > 0) {
        this.logger.log(`Rate limiter pruned ${removed} idle bucket(s).`);
      }
    }, PRUNE_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Records `now` against the key and decides whether the request is allowed.
   * The window is `[now - windowMs, now]`; hits older than the window are
   * pruned on access so memory stays bounded by active keys.
   */
  consume(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitDecision {
    if (!Number.isInteger(limit) || limit <= 0 || !Number.isInteger(windowMs) || windowMs <= 0) {
      this.logger.error(
        `Rate limiter misconfigured (limit=${limit}, windowMs=${windowMs}); failing closed.`,
      );
      return { allowed: false, retryAfterMs: windowMs };
    }

    const state = this.buckets.get(key);
    if (!state) {
      this.buckets.set(key, { hits: [now], lastSeen: now });
      return { allowed: true, retryAfterMs: 0 };
    }

    const cutoff = now - windowMs;
    state.hits = state.hits.filter((ts) => ts > cutoff);
    state.lastSeen = now;

    if (state.hits.length >= limit) {
      const oldest = state.hits[0];
      return { allowed: false, retryAfterMs: Math.max(1, windowMs - (now - oldest)) };
    }

    state.hits.push(now);
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Removes keys that have not been touched for at least `idleMs`. */
  pruneIdle(idleMs: number, now = Date.now()): number {
    let removed = 0;
    for (const [key, state] of this.buckets) {
      if (now - state.lastSeen > idleMs) {
        this.buckets.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  /** Test/utility accessor — number of live keys. */
  get size(): number {
    return this.buckets.size;
  }

  clear(): void {
    this.buckets.clear();
  }
}
