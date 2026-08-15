import { RateLimitService } from './rate-limit.service';

describe('RateLimitService (sliding window)', () => {
  let limiter: RateLimitService;

  beforeEach(() => {
    limiter = new RateLimitService();
  });

  it('allows requests up to the configured limit within a window', () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(limiter.consume('ip:cart', 3, 60_000, now)).toEqual({
        allowed: true,
        retryAfterMs: 0,
      });
    }
  });

  it('rejects the request that exceeds the limit and reports a retry time', () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      limiter.consume('ip:cart', 3, 60_000, now);
    }
    const decision = limiter.consume('ip:cart', 3, 60_000, now);
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterMs).toBeGreaterThan(0);
    expect(decision.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it('keys are isolated per client IP (one client cannot exhaust another budget)', () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      limiter.consume('ip-a:cart', 3, 60_000, now);
    }
    expect(limiter.consume('ip-b:cart', 3, 60_000, now).allowed).toBe(true);
    expect(limiter.consume('ip-a:cart', 3, 60_000, now).allowed).toBe(false);
  });

  it('keys are isolated per bucket (checkout exhaustion does not block browsing)', () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      limiter.consume('ip:checkout', 3, 60_000, now);
    }
    expect(limiter.consume('ip:storefront-read', 3, 60_000, now).allowed).toBe(true);
  });

  it('allows again after the window slides past the oldest hit', () => {
    const start = 1_000_000;
    for (let i = 0; i < 3; i++) {
      limiter.consume('ip:checkout', 3, 60_000, start + i * 1_000);
    }
    // 61s after the first hit the window no longer contains it.
    const decision = limiter.consume('ip:checkout', 3, 60_000, start + 61_000);
    expect(decision.allowed).toBe(true);
  });

  it('fails closed on a misconfigured limit', () => {
    const decision = limiter.consume('ip:auth', 0, 60_000, 1_000_000);
    expect(decision.allowed).toBe(false);
  });

  it('fails closed on a misconfigured window', () => {
    const decision = limiter.consume('ip:auth', 5, -1, 1_000_000);
    expect(decision.allowed).toBe(false);
  });

  it('pruneIdle removes untouched keys', () => {
    limiter.consume('ip:cart', 5, 60_000, 1_000_000);
    limiter.consume('ip:cart', 5, 60_000, 1_100_000);
    expect(limiter.size).toBe(1);
    // No idle time elapsed since the last touch.
    expect(limiter.pruneIdle(5000, 1_100_000)).toBe(0);
    expect(limiter.size).toBe(1);
    // 900s later the key is idle and pruned.
    expect(limiter.pruneIdle(5000, 2_000_000)).toBe(1);
    expect(limiter.size).toBe(0);
  });
});
