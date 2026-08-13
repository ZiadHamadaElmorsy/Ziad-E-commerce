import { ForbiddenError } from '../../common/errors/domain-exceptions';
import { StoreMembershipRepository } from '../repositories/store-membership.repository';
import { MembershipService } from './membership.service';

describe('MembershipService', () => {
  let memberships: { findActiveMembership: jest.Mock };
  let service: MembershipService;

  beforeEach(() => {
    memberships = { findActiveMembership: jest.fn() };
    service = new MembershipService(memberships as unknown as StoreMembershipRepository);
  });

  function membership(role: 'OWNER' | 'ADMIN' | 'STAFF', status = 'ACTIVE') {
    return { id: 'm-1', storeId: 'store-1', userId: 'user-1', role, status };
  }

  it('resolves an ACTIVE membership and returns its role', async () => {
    memberships.findActiveMembership.mockResolvedValue(membership('OWNER'));

    const result = await service.resolveMembership('user-1', 'store-1');

    expect(memberships.findActiveMembership).toHaveBeenCalledWith('user-1', 'store-1');
    expect(result.membership.role).toBe('OWNER');
    expect(result.membership.status).toBe('ACTIVE');
  });

  it('rejects with FORBIDDEN when no membership exists', async () => {
    memberships.findActiveMembership.mockResolvedValue(null);

    await expect(service.resolveMembership('user-1', 'store-1')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('rejects an inactive membership with FORBIDDEN (never resolves it)', async () => {
    // The repository only ever returns ACTIVE rows; an inactive membership is
    // therefore indistinguishable from "no membership" -> fail closed.
    memberships.findActiveMembership.mockResolvedValue(null);

    await expect(service.resolveMembership('user-1', 'store-1')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(memberships.findActiveMembership).toHaveBeenCalledWith('user-1', 'store-1');
  });

  it('always derives the role from the database membership (never from input)', async () => {
    memberships.findActiveMembership.mockResolvedValue(membership('ADMIN'));

    const result = await service.resolveMembership('user-1', 'store-1');

    expect(result.membership.role).toBe('ADMIN');
  });
});
