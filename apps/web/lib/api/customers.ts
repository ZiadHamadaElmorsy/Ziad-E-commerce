import { api, toQueryString } from './client';
import type {
  CustomerOrderView,
  CustomerView,
  Envelope,
  ListCustomersParams,
  Paginated,
} from './types';

/**
 * Customers API — every call hits the real backend
 * (GET /api/v1/customers, docs/API-SPEC.md §20).
 */
export const customersApi = {
  listCustomers: (params: ListCustomersParams = {}) =>
    api.get<Paginated<CustomerView>>(`/customers${toQueryString({ ...params })}`),

  getCustomer: (customerId: string) => api.get<Envelope<CustomerView>>(`/customers/${customerId}`),

  listCustomerOrders: (customerId: string, params: { page?: number; limit?: number } = {}) =>
    api.get<Paginated<CustomerOrderView>>(
      `/customers/${customerId}/orders${toQueryString({ ...params })}`,
    ),
};
