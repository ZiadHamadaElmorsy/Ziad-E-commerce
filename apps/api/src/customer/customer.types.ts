import { Customer, CustomerAddress, Order, OrderStatus } from '@prisma/client';
import { buildPaginationMeta, PaginatedView } from '../catalog/catalog.types';

/**
 * Public Customer representations returned by the merchant Customer API
 * (docs/API-SPEC.md §20).
 *
 * They intentionally exclude internal columns (store_id, auth_user_id,
 * created_at, updated_at) — only fields documented in the source documents
 * (docs/DATABASE.md §7.12/§7.13) are exposed. `auth_user_id` is reserved for
 * future customer authentication (DATABASE.md §18.2) and is never rendered.
 * Order money is rendered as integer minor units (EGP piastres); the internal
 * BIGINT is converted to a plain number by the mappers.
 */

export interface CustomerView {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string;
  lastName: string;
}

export interface CustomerAddressView {
  id: string;
  customerId: string;
  label: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  country: string | null;
  governorate: string | null;
  city: string;
  addressLine: string;
  building: string | null;
  apartment: string | null;
  postalCode: string | null;
  isDefault: boolean;
}

/**
 * Read-only order-history projection for `GET /customers/:customerId/orders`
 * (docs/API-SPEC.md §20). The full Order representation is owned by the
 * Orders phase; this is a minimal, documented Customer-side projection.
 */
export interface CustomerOrderView {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  currency: string;
  grandTotal: number;
  createdAt: string;
}

export function toCustomerView(customer: Customer): CustomerView {
  return {
    id: customer.id,
    email: customer.email,
    phone: customer.phone,
    firstName: customer.firstName,
    lastName: customer.lastName,
  };
}

export function toCustomerAddressView(address: CustomerAddress): CustomerAddressView {
  return {
    id: address.id,
    customerId: address.customerId,
    label: address.label,
    firstName: address.firstName,
    lastName: address.lastName,
    phone: address.phone,
    country: address.country,
    governorate: address.governorate,
    city: address.city,
    addressLine: address.addressLine,
    building: address.building,
    apartment: address.apartment,
    postalCode: address.postalCode,
    isDefault: address.isDefault,
  };
}

export function toCustomerOrderView(order: Order): CustomerOrderView {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    currency: order.currency,
    grandTotal: Number(order.grandTotal),
    createdAt: order.createdAt.toISOString(),
  };
}

export { buildPaginationMeta, PaginatedView };
