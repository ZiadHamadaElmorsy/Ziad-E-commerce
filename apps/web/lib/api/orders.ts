import { api, toQueryString } from './client';
import type {
  Envelope,
  ListOrdersParams,
  OrderStatus,
  OrderSummaryView,
  OrderView,
  Paginated,
  ShipmentView,
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

  // --- Shipping (Phase 27 — Part 10) -----------------------------------------

  /** POST /orders/:orderId/shipment — idempotent create shipment. */
  createShipment: (orderId: string) =>
    api.post<Envelope<ShipmentView>>(`/orders/${orderId}/shipment`),

  /** GET /orders/:orderId/shipment — merchant shipment detail. */
  getShipment: (orderId: string) =>
    api.get<Envelope<ShipmentView>>(`/orders/${orderId}/shipment`),

  /** POST /orders/:orderId/shipment/refresh — re-fetch provider tracking. */
  refreshShipment: (orderId: string) =>
    api.post<Envelope<ShipmentView>>(`/orders/${orderId}/shipment/refresh`),

  /** POST /orders/:orderId/shipment/cancel — cancel the shipment. */
  cancelShipment: (orderId: string) =>
    api.post<Envelope<ShipmentView>>(`/orders/${orderId}/shipment/cancel`),

  /** GET /orders/:orderId/shipment/label — print shipping label. */
  getShipmentLabel: (orderId: string) =>
    api.get<Envelope<{ labelUrl: string } | null>>(`/orders/${orderId}/shipment/label`),
};
