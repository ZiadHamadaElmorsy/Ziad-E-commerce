import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Persistence access for the platform-level application `users` table.
 *
 * Encapsulates Prisma access only — no business rules. A User row mirrors the
 * Supabase Auth identity (docs/DATABASE.md §7.1) and must already exist when
 * Identity & Tenancy operations run; user *provisioning* is an open
 * dependency (see docs/IMPLEMENTATION-PHASE2-IDENTITY-TENANCY.md).
 */
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Finds the application User row mirroring a Supabase Auth subject. */
  async findByAuthUserId(authUserId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { authUserId } });
  }

  /**
   * Finds the application User row mirroring a Supabase Auth subject inside
   * the caller's transaction (used by the Orders phase to resolve the
   * audit-log actor in the same transaction as the audited write).
   */
  async findByAuthUserIdTx(tx: Prisma.TransactionClient, authUserId: string): Promise<User | null> {
    return tx.user.findUnique({ where: { authUserId } });
  }

  /** Finds an application User row by its application-level UUID. */
  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
