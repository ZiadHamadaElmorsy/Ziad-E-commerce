import { Module } from '@nestjs/common';
import { CategoriesController } from './controllers/categories.controller';
import { ProductsController } from './controllers/products.controller';
import { VariantsController } from './controllers/variants.controller';
import { CategoryRepository } from './repositories/category.repository';
import { ProductCategoryRepository } from './repositories/product-category.repository';
import { ProductRepository } from './repositories/product.repository';
import { ProductVariantRepository } from './repositories/product-variant.repository';
import { CategoriesService } from './services/categories.service';
import { ProductsService } from './services/products.service';
import { VariantsService } from './services/variants.service';

/**
 * Catalog module (Phase 3).
 *
 * Implements Product / ProductVariant / Category / ProductCategory on top of
 * the Phase 1/2 foundation (authentication boundary, tenant context,
 * transaction helper, RLS binder).
 *
 * Controller -> Service -> Repository -> Database.
 * Business rules live in the service/domain layer; controllers stay thin.
 */
@Module({
  controllers: [ProductsController, VariantsController, CategoriesController],
  providers: [
    ProductsService,
    VariantsService,
    CategoriesService,
    ProductRepository,
    ProductVariantRepository,
    CategoryRepository,
    ProductCategoryRepository,
  ],
  // ProductVariantRepository is shared with the Inventory module (Phase 4) so
  // variant ownership/tenant rules are resolved by ONE implementation.
  // ProductRepository is shared with the Cart module (Phase 6) so product
  // ownership/purchasability is resolved by ONE implementation.
  exports: [ProductVariantRepository, ProductRepository],
})
export class CatalogModule {}
