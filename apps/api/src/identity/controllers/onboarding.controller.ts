import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { SkipTenantContext } from '../../common/decorators/skip-tenant-context.decorator';
import { CreateMerchantDto } from '../dto/create-merchant.dto';
import {
  CreateMerchantResult,
  OnboardingService,
  OnboardingStatusView,
} from '../services/onboarding.service';

/**
 * Merchant onboarding API (Phase 17).
 *
 *   POST /api/v1/onboarding/merchant   create the merchant (idempotent):
 *                                        application User + Store + OWNER
 *                                        membership + TRIAL subscription.
 *   GET  /api/v1/onboarding/status     current merchant state (user / store /
 *                                        membership) for routing.
 *
 * Both routes are authenticated but deliberately `@SkipTenantContext()`: a
 * merchant creating their first store has no membership yet, so the global
 * tenant resolution cannot apply. The Store id is NEVER accepted from the
 * client — the tenant boundary is created server-side from the verified
 * identity and consumed afterwards through the trusted tenant context.
 */
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('merchant')
  @HttpCode(HttpStatus.CREATED)
  @SkipTenantContext()
  async createMerchant(@Body() dto: CreateMerchantDto): Promise<{ data: CreateMerchantResult }> {
    const result = await this.onboarding.createMerchant(dto);
    return { data: result };
  }

  @Get('status')
  @SkipTenantContext()
  async getStatus(): Promise<{ data: OnboardingStatusView }> {
    const status = await this.onboarding.getStatus();
    return { data: status };
  }
}
