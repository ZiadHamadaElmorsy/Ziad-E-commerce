import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { requireStoreId } from '../../catalog/domain/catalog-tenant';
import { RequestContextService } from '../../common/context/request-context.service';
import { NotFoundError } from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { CustomerAddressView, toCustomerAddressView } from '../customer.types';
import { mapCustomerWriteError } from '../domain/customer-error.mapper';
import { validateDtoOrThrow } from '../domain/customer-validation';
import { CreateCustomerAddressDto } from '../dto/create-customer-address.dto';
import { UpdateCustomerAddressDto } from '../dto/update-customer-address.dto';
import { CustomerAddressRepository } from '../repositories/customer-address.repository';
import { CustomerRepository } from '../repositories/customer.repository';

/**
 * CustomerAddress application service — the address-book boundary for the
 * future Checkout/Order phases.
 *
 * docs/API-SPEC.md §20 defines NO CustomerAddress HTTP endpoints, so these
 * operations are exposed as services only (no controller), mirroring the
 * InventoryReservationService precedent. Business rules follow
 * docs/DOMAIN-MODEL.md §9.2 and docs/DATABASE.md §7.13 exactly:
 *
 * - An address ALWAYS belongs to a Customer, and the Customer + Address pair
 *   MUST belong to the same tenant. Every operation first resolves the
 *   customer in the trusted store (NOT_FOUND when absent) and then scopes all
 *   address reads/writes by (storeId, customerId) — cross-tenant access fails
 *   closed with NOT_FOUND (existence is never leaked).
 * - The store id ALWAYS comes from the resolved tenant context; client input
 *   is never an authorization source and client-supplied ownership
 *   (customer_id on the body) is never accepted.
 * - Writes run inside `TransactionService.runWithTenant(storeId, ...)` so RLS
 *   sees the correct tenant and the pooled connection never retains state.
 * - No invented rules: no address types, no default-address uniqueness, no
 *   maximum address count, no normalization, no country-specific validation.
 * - Historical orders NEVER depend on current address rows (Orders snapshots
 *   its own shipping data — DATABASE.md §24.2); this service only manages the
 *   reusable address book and does not touch orders.
 */
@Injectable()
export class CustomerAddressesService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly customers: CustomerRepository,
    private readonly addresses: CustomerAddressRepository,
    private readonly transaction: TransactionService,
  ) {}

  async create(customerId: string, dto: CreateCustomerAddressDto): Promise<CustomerAddressView> {
    const storeId = requireStoreId(this.requestContext);
    const input = plainToInstance(CreateCustomerAddressDto, dto);
    await validateDtoOrThrow(input);

    await this.requireCustomerInStore(storeId, customerId);

    try {
      const created = await this.transaction.runWithTenant(storeId, (tx) =>
        this.addresses.create(tx, {
          storeId,
          customerId,
          label: input.label ?? null,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone ?? null,
          country: input.country ?? null,
          governorate: input.governorate ?? null,
          city: input.city,
          addressLine: input.addressLine,
          building: input.building ?? null,
          apartment: input.apartment ?? null,
          postalCode: input.postalCode ?? null,
          isDefault: input.isDefault ?? false,
        }),
      );
      return toCustomerAddressView(created);
    } catch (error) {
      throw mapCustomerWriteError(error, {});
    }
  }

  async listByCustomer(customerId: string): Promise<CustomerAddressView[]> {
    const storeId = requireStoreId(this.requestContext);
    await this.requireCustomerInStore(storeId, customerId);

    const addresses = await this.addresses.findManyByCustomer(storeId, customerId);
    return addresses.map(toCustomerAddressView);
  }

  async get(customerId: string, addressId: string): Promise<CustomerAddressView> {
    const storeId = requireStoreId(this.requestContext);
    await this.requireCustomerInStore(storeId, customerId);

    const address = await this.addresses.findById(storeId, customerId, addressId);
    if (!address) {
      throw new NotFoundError('The customer address was not found.');
    }
    return toCustomerAddressView(address);
  }

  async update(
    customerId: string,
    addressId: string,
    dto: UpdateCustomerAddressDto,
  ): Promise<CustomerAddressView> {
    const storeId = requireStoreId(this.requestContext);
    const input = plainToInstance(UpdateCustomerAddressDto, dto);
    await validateDtoOrThrow(input);

    await this.requireCustomerInStore(storeId, customerId);

    try {
      const { count } = await this.transaction.runWithTenant(storeId, (tx) =>
        this.addresses.update(tx, storeId, customerId, addressId, this.buildUpdateInput(input)),
      );
      if (count === 0) {
        throw new NotFoundError('The customer address was not found.');
      }
    } catch (error) {
      throw mapCustomerWriteError(error, {});
    }

    const updated = await this.addresses.findById(storeId, customerId, addressId);
    if (!updated) {
      throw new NotFoundError('The customer address was not found.');
    }
    return toCustomerAddressView(updated);
  }

  async delete(customerId: string, addressId: string): Promise<void> {
    const storeId = requireStoreId(this.requestContext);
    await this.requireCustomerInStore(storeId, customerId);

    const { count } = await this.transaction.runWithTenant(storeId, (tx) =>
      this.addresses.delete(tx, storeId, customerId, addressId),
    );
    if (count === 0) {
      throw new NotFoundError('The customer address was not found.');
    }
  }

  /** Address ownership: the owning customer must exist in the current store. */
  private async requireCustomerInStore(storeId: string, customerId: string): Promise<void> {
    const customer = await this.customers.findById(storeId, customerId);
    if (!customer) {
      throw new NotFoundError('The customer was not found.');
    }
  }

  private buildUpdateInput(dto: UpdateCustomerAddressDto): Partial<CreateCustomerAddressDto> {
    const input: Record<string, unknown> = {};
    if (dto.label !== undefined) input.label = dto.label;
    if (dto.firstName !== undefined) input.firstName = dto.firstName;
    if (dto.lastName !== undefined) input.lastName = dto.lastName;
    if (dto.phone !== undefined) input.phone = dto.phone;
    if (dto.country !== undefined) input.country = dto.country;
    if (dto.governorate !== undefined) input.governorate = dto.governorate;
    if (dto.city !== undefined) input.city = dto.city;
    if (dto.addressLine !== undefined) input.addressLine = dto.addressLine;
    if (dto.building !== undefined) input.building = dto.building;
    if (dto.apartment !== undefined) input.apartment = dto.apartment;
    if (dto.postalCode !== undefined) input.postalCode = dto.postalCode;
    if (dto.isDefault !== undefined) input.isDefault = dto.isDefault;
    return input;
  }
}
