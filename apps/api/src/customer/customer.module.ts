import { Module } from '@nestjs/common';
import { CustomersController } from './controllers/customers.controller';
import { CustomerAddressRepository } from './repositories/customer-address.repository';
import { CustomerRepository } from './repositories/customer.repository';
import { CustomerAddressesService } from './services/customer-addresses.service';
import { CustomersService } from './services/customers.service';

/**
 * Customer module (Phase 5).
 *
 * Implements the merchant Customer API (docs/API-SPEC.md §20) plus the
 * CustomerAddress address-book services on top of the Phase 1-4 foundation.
 *
 * Controller -> Service -> Repository -> Database.
 * Business rules live in the service/domain layer; controllers stay thin.
 *
 * CustomerAddressesService + the repositories are exported as the
 * integration-ready boundary for the future Checkout/Order phases (they are
 * NOT exposed through any HTTP endpoint in this phase — API-SPEC §20 defines
 * no address endpoints, mirroring the InventoryReservationService precedent).
 */
@Module({
  controllers: [CustomersController],
  providers: [
    CustomersService,
    CustomerAddressesService,
    CustomerRepository,
    CustomerAddressRepository,
  ],
  exports: [CustomerAddressesService, CustomerRepository, CustomerAddressRepository],
})
export class CustomerModule {}
