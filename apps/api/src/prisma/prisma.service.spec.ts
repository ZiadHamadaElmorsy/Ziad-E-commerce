process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ziad_test';

import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it('logs an error but does not throw when the database is unreachable', async () => {
    const service = new PrismaService();

    const connectSpy = jest
      .spyOn(service, '$connect')
      .mockRejectedValue(new Error('connection refused'));
    const logger = service['logger'];
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();

    connectSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
