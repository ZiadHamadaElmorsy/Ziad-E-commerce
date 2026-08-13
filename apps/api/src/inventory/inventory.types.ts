import {
  Inventory,
  InventoryMovement,
  InventoryReservation,
  MovementType,
  ReservationStatus,
} from '@prisma/client';
import { buildPaginationMeta, PaginatedView } from '../catalog/catalog.types';

/**
 * Public Inventory representations returned by the merchant Inventory API
 * (docs/API-SPEC.md §19).
 *
 * They intentionally exclude internal columns (id, store_id, created_at,
 * updated_at) — only fields meaningful to the merchant are exposed, following
 * the Catalog view conventions. `available` is ALWAYS derived
 * (available = on_hand - reserved, docs/DATABASE.md §13.2) and never stored.
 */

export interface InventoryView {
  variantId: string;
  onHand: number;
  reserved: number;
  available: number;
}

export interface MovementView {
  id: string;
  variantId: string;
  movementType: MovementType;
  /** Signed delta (see docs/DATABASE.md §13.5 for the target counter). */
  quantity: number;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  onHandAfter: number;
  reservedAfter: number;
  createdAt: string;
}

/** Service-level reservation representation (consumed by later phases). */
export interface ReservationView {
  id: string;
  variantId: string;
  cartId: string | null;
  orderId: string | null;
  quantity: number;
  status: ReservationStatus;
  expiresAt: string | null;
  releasedAt: string | null;
  consumedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** available = on_hand_quantity - reserved_quantity (derived, never stored). */
export function computeAvailable(onHandQuantity: number, reservedQuantity: number): number {
  return onHandQuantity - reservedQuantity;
}

export function toInventoryView(inventory: Inventory): InventoryView {
  return {
    variantId: inventory.variantId,
    onHand: inventory.onHandQuantity,
    reserved: inventory.reservedQuantity,
    available: computeAvailable(inventory.onHandQuantity, inventory.reservedQuantity),
  };
}

export function toMovementView(movement: InventoryMovement): MovementView {
  return {
    id: movement.id,
    variantId: movement.variantId,
    movementType: movement.movementType,
    quantity: movement.quantity,
    referenceType: movement.referenceType,
    referenceId: movement.referenceId,
    reason: movement.reason,
    onHandAfter: movement.onHandAfter,
    reservedAfter: movement.reservedAfter,
    createdAt: movement.createdAt.toISOString(),
  };
}

export function toReservationView(reservation: InventoryReservation): ReservationView {
  return {
    id: reservation.id,
    variantId: reservation.variantId,
    cartId: reservation.cartId,
    orderId: reservation.orderId,
    quantity: reservation.quantity,
    status: reservation.status,
    expiresAt: reservation.expiresAt === null ? null : reservation.expiresAt.toISOString(),
    releasedAt: reservation.releasedAt === null ? null : reservation.releasedAt.toISOString(),
    consumedAt: reservation.consumedAt === null ? null : reservation.consumedAt.toISOString(),
    createdAt: reservation.createdAt.toISOString(),
    updatedAt: reservation.updatedAt.toISOString(),
  };
}

export { buildPaginationMeta, PaginatedView };
