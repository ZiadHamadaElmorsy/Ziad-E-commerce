import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ShipmentsService } from '../services/shipments.service';
import { ShipmentView } from '../shipping.types';

/**
 * Merchant shipping API (Phase 27 — Part 10).
 *
 *   POST  /api/v1/orders/:orderId/shipment          Create Shipment (idempotent)
 *   GET   /api/v1/orders/:orderId/shipment          Get Shipment
 *   POST  /api/v1/orders/:orderId/shipment/refresh  Refresh Tracking
 *   POST  /api/v1/orders/:orderId/shipment/cancel   Cancel Shipment
 *   GET   /api/v1/orders/:orderId/shipment/label    Print Shipping Label
 *
 * Thin controller — all business rules live in ShipmentsService. The routes
 * are authenticated + tenant-scoped through the global guard chain; the store
 * comes from the resolved tenant context, never from client input. The
 * merchant-facing view exposes the provider NAME and the tracking number but
 * never provider credentials or raw provider payloads.
 */
@Controller('orders/:orderId/shipment')
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Param('orderId') orderId: string) {
    const shipment = await this.shipments.createShipment(orderId);
    return { data: shipment };
  }

  @Get()
  async get(@Param('orderId') orderId: string): Promise<{ data: ShipmentView }> {
    const shipment = await this.shipments.getShipment(orderId);
    return { data: shipment };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Param('orderId') orderId: string) {
    const shipment = await this.shipments.refreshTracking(orderId);
    return { data: shipment };
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('orderId') orderId: string) {
    const shipment = await this.shipments.cancelShipment(orderId);
    return { data: shipment };
  }

  @Get('label')
  async label(@Param('orderId') orderId: string) {
    const label = await this.shipments.getLabel(orderId);
    return { data: label };
  }
}
