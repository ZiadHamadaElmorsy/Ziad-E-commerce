import { ROLES_KEY, Roles } from './roles.decorator';

describe('Roles decorator', () => {
  it('stores the declared roles as route metadata', () => {
    class TestController {
      @Roles('OWNER')
      ownerOnly() {
        return undefined;
      }

      @Roles('OWNER', 'ADMIN')
      ownerOrAdmin() {
        return undefined;
      }
    }

    expect(Reflect.getMetadata(ROLES_KEY, TestController.prototype.ownerOnly)).toEqual(['OWNER']);
    expect(Reflect.getMetadata(ROLES_KEY, TestController.prototype.ownerOrAdmin)).toEqual([
      'OWNER',
      'ADMIN',
    ]);
  });
});
