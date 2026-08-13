import { IsEnum } from 'class-validator';
import { OrderStatus } from '@prisma/client';

/**
 * PATCH /api/v1/orders/:orderId/status request body (docs/API-SPEC.md §23
 * "Update Order Status" — `{ "status": "PROCESSING" }`).
 *
 * The target status is the FINAL order lifecycle enum; the backend validates
 * the transition against the documented state machine (docs/DOMAIN-MODEL.md
 * §12.3, docs/DATABASE.md §15.2) and never trusts the status alone.
 */
export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
