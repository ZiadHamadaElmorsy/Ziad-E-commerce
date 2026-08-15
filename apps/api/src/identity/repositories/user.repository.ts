import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal write input for creating the application User row (docs/DATABASE.md §7.1). */
export interface CreateUserInput {
  authUserId: string;
  firstName: string;
  lastName: string;
  email: string;
}

/**
 * Persistence access for the platform-level application `users` table.
 *
 * Encapsulates Prisma access only — no business rules. A User row mirrors the
 * Supabase Auth identity (docs/DATABASE.md §7.1). Since Phase 17 (merchant
 * onboarding) the row is provisioned idempotently by the OnboardingService
 * during merchant registration.
 */
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Finds the application User row mirroring a Supabase Auth subject. */
  async findByAuthUserId(authUserId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { authUserId } });
  }

  /** Creates the application User row inside the caller's transaction. */
  async create(tx: Prisma.TransactionClient, data: CreateUserInput): Promise<User> {
    return tx.user.create({
      data: {
        authUserId: data.authUserId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
      },
    });
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
