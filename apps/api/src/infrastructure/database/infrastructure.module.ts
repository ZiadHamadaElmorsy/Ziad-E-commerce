import { Global, Module } from '@nestjs/common';
import { RlsTenantBinder } from './rls-tenant-binder';
import { TransactionService } from './transaction.service';

/**
 * Global infrastructure foundation (database transaction boundary + RLS tenant
 * binder). Future domain modules inject TransactionService directly.
 */
@Global()
@Module({
  providers: [TransactionService, RlsTenantBinder],
  exports: [TransactionService, RlsTenantBinder],
})
export class InfrastructureModule {}
