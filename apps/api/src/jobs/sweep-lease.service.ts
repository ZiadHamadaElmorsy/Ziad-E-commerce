import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Distributed lease for background maintenance jobs (Phase 23).
 *
 * A multi-instance deployment must never run the cart/reservation expiry sweep
 * concurrently on every node. This service implements a tiny lease on the
 * `job_leases` table:
 *
 *   tryAcquire(jobName, ttlMs, owner)
 *     INSERT ... ON CONFLICT (job_name) DO UPDATE
 *       SET owner/acquired_at/lease_expires_at
 *       WHERE lease_expires_at < now()
 *     -> exactly 1 affected row == the lease was granted; 0 == held by another
 *        (or a not-yet-expired) owner.
 *
 * The lease auto-expires after `ttlMs` so a crashed instance can never block
 * the sweep, and the sweep itself remains idempotent (guarded transitions),
 * so even the pathological "two sweeps overlap" case cannot double-release
 * inventory. `release` is best-effort (DELETE by job + owner).
 *
 * Session-safe by construction: every statement is a short independent query,
 * so Prisma's connection pool (different connections per statement) is not an
 * issue (a session-scoped `pg_advisory_lock` would be).
 */
@Injectable()
export class SweepLeaseService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tries to acquire the lease for `jobName`. Returns true only when THIS
   * caller won the lease; false when another node currently holds it.
   */
  async tryAcquire(jobName: string, ttlMs: number, owner: string): Promise<boolean> {
    const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
    const affected = await this.prisma.$executeRaw`
      INSERT INTO "job_leases" (job_name, lease_owner, acquired_at, lease_expires_at)
      VALUES (${jobName}, ${owner}, now(), now() + make_interval(secs => ${ttlSeconds}))
      ON CONFLICT (job_name)
      DO UPDATE SET
        lease_owner = EXCLUDED.lease_owner,
        acquired_at = now(),
        lease_expires_at = EXCLUDED.lease_expires_at
      WHERE "job_leases".lease_expires_at < now()`;
    return affected === 1;
  }

  /** Best-effort release. Only the current owner can release the lease. */
  async release(jobName: string, owner: string): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM "job_leases" WHERE job_name = ${jobName} AND lease_owner = ${owner}`;
  }
}
