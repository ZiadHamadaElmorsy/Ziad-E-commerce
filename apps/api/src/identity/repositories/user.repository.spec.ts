import type { PrismaService } from '../../prisma/prisma.service';
import { UserRepository } from './user.repository';

describe('UserRepository', () => {
  let prisma: { user: { findUnique: jest.Mock } };
  let repository: UserRepository;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    repository = new UserRepository(prisma as unknown as PrismaService);
  });

  it('findByAuthUserId looks up the unique Supabase Auth subject', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', authUserId: 'auth-1' });

    await repository.findByAuthUserId('auth-1');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { authUserId: 'auth-1' } });
  });

  it('findById looks up the application-level UUID', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', authUserId: 'auth-1' });

    await repository.findById('user-1');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  it('returns null when the row does not exist (callers fail closed)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(repository.findByAuthUserId('unknown')).resolves.toBeNull();
  });
});
