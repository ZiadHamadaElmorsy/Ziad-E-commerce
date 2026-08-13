import { api, toQueryString } from './client';
import type {
  Envelope,
  ListOrdersParams,
  OrderStatus,
  OrderSummaryView,
  OrderView,
  Paginated,
} from './types';

/**
 * Orders API — every call hits the real backend
 * (GET/PATCH /api/v1/orders, see docs/API-SPEC.md §23).
 */
export const ordersApi = {
  listOrders: (params: ListOrdersParams = {}) =>
    api.get<Paginated<OrderSummaryView>>(`/orders${toQueryString({ ...params })}`),

  getOrder: (orderId: string) => api.get<Envelope<OrderView>>(`/orders/${orderId}`),

  updateOrderStatus: (orderId: string, status: OrderStatus) =>
    api.patch<Envelope<OrderView>>(`/orders/${orderId}/status`, { status }),
};
