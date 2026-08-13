import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { OrdersModule } from '../orders/orders.module';
import { PagesController } from './controllers/pages.controller';
import { PageSectionsController } from './controllers/page-sections.controller';
import { NavigationController } from './controllers/navigation.controller';
import { ThemeController } from './controllers/theme.controller';
import { PageRepository } from './repositories/page.repository';
import { PageSectionRepository } from './repositories/page-section.repository';
import { NavigationRepository } from './repositories/navigation.repository';
import { ThemeRepository } from './repositories/theme.repository';
import { PagesService } from './services/pages.service';
import { PageSectionsService } from './services/page-sections.service';
import { NavigationService } from './services/navigation.service';
import { ThemeService } from './services/theme.service';
import { CmsAuditService } from './services/cms-audit.service';

/**
 * CMS module (roadmap Phase 12).
 *
 * Implements the merchant CMS API (docs/API-SPEC.md §25-§28): Pages /
 * Page Sections / Navigation / Theme settings / Store branding on top of the
 * FINAL schema (pages, page_sections, navigations, theme_configurations) and
 * the Phase 1/2 foundation (authentication boundary, tenant context,
 * transaction helper, RLS binder).
 *
 * Controller -> Service -> Repository -> Database.
 * Business rules live in the service/domain layer; controllers stay thin.
 *
 * The module reuses:
 *   - IdentityModule (UserRepository: audit actor resolution)
 *   - OrdersModule   (AuditLogRepository: append-only audit trail for
 *                     navigation/theme administrative changes — DATABASE
 *                     §21.3/§25.1)
 */
@Module({
  imports: [IdentityModule, OrdersModule],
  controllers: [PagesController, PageSectionsController, NavigationController, ThemeController],
  providers: [
    PagesService,
    PageSectionsService,
    NavigationService,
    ThemeService,
    CmsAuditService,
    PageRepository,
    PageSectionRepository,
    NavigationRepository,
    ThemeRepository,
  ],
})
export class CmsModule {}
