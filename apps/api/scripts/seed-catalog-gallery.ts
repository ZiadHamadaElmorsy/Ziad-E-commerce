/**
 * Phase 26 - catalog/gallery seed (SAFE / STAGING ONLY).
 *
 * Creates a dedicated test store with the exact catalog scenarios the gallery
 * feature must support:
 *
 *   Product A (Arabic name): 3 categories, 3 colors x 3 sizes = 9 variants,
 *                             6 images (product-level + variant-linked).
 *   Product B (English name): 2 categories, 2 colors x 2 sizes = 4 variants,
 *                             10 images.
 *   Large Gallery Product:    100+ media records (metadata only) to exercise
 *                             gallery pagination at scale. Media rows carry a
 *                             synthetic storage_path so the METADATA APIs
 *                             (list/order/primary) work; the binaries are not
 *                             uploaded, so the content endpoint returns 404
 *                             for these synthetic rows (upload real files via
 *                             POST /media to render them).
 *
 * SAFETY:
 *   - NEVER point this at a production DATABASE_URL. It creates real rows in
 *     whatever database it connects to (as the connecting role, typically the
 *     table owner which bypasses RLS).
 *   - The test store slug is always catalog-gallery-<timestamp>.
 *   - Pass --keep to keep the data for inspection (default: deletes the store
 *     and everything it owns when the script finishes).
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx ts-node scripts/seed-catalog-gallery.ts [--keep]
 */
import { Prisma, PrismaClient, ProductStatus, VariantStatus } from '@prisma/client';

const KEEP = process.argv.includes('--keep');
const LARGE_GALLERY_COUNT = Number(process.env.LARGE_GALLERY_COUNT ?? 120);

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const storeSlug = `catalog-gallery-${Date.now()}`;
  console.log(
    `Catalog/gallery seed - store ${storeSlug} (large gallery = ${LARGE_GALLERY_COUNT} media, keep=${KEEP})`,
  );

  await prisma.$connect();

  const store = await prisma.store.create({
    data: {
      slug: storeSlug,
      name: 'Catalog Gallery Test Store',
      description: 'Temporary Phase 26 catalog/gallery seed data - safe to delete.',
      status: 'ACTIVE',
      currency: 'EGP',
    },
  });
  const storeId = store.id;

  try {
    // --- Categories ----------------------------------------------------------
    const men = await category(storeId, 'رجالي', 'Men', 'men');
    const tshirts = await category(storeId, 'تيشيرتات', 'T-Shirts', 't-shirts');
    const summer = await category(storeId, 'صيفي', 'Summer', 'summer');
    const casual = await category(storeId, 'كاجوال', 'Casual', 'casual');
    const sports = await category(storeId, 'رياضي', 'Sports', 'sports');

    // --- Product A: Arabic name, 3 categories, 9 variants, 6 images ---------
    const productA = await product(
      storeId,
      'تي شيرت رجالي كلاسيك',
      'Classic Men T-Shirt',
      'قُمصان قطنية كلاسيكية مريحة',
      'Classic cotton t-shirt',
      'classic-men-tshirt',
    );
    await linkProduct(storeId, productA.id, [men.id, tshirts.id, summer.id]);

    const colorsA = ['أسود', 'أبيض', 'أحمر'];
    const sizesA = ['S', 'M', 'L'];
    let variantIndex = 1;
    for (const color of colorsA) {
      for (const size of sizesA) {
        await variant(storeId, productA.id, {
          name: `${color} / ${size}`,
          attributes: { color, size },
          sku: `TS-${roman(variantIndex)}-${size}`,
          price: 550_00 + variantIndex * 25_00,
        });
        variantIndex += 1;
      }
    }

    const imagesA = await attachImages(storeId, productA.id, 6, 'A');
    // First image = primary product-level cover.
    await prisma.productMedia.update({
      where: { id: imagesA[0] },
      data: { isPrimary: true },
    });

    // --- Product B: English name, 2 categories, 4 variants, 10 images -------
    const productB = await product(
      storeId,
      'قميص قطني أنيق',
      'Stylish Cotton Shirt',
      null,
      'A stylish cotton shirt',
      'stylish-cotton-shirt',
    );
    await linkProduct(storeId, productB.id, [casual.id, sports.id]);

    const colorsB = ['Black', 'White'];
    const sizesB = ['M', 'L'];
    variantIndex = 1;
    for (const color of colorsB) {
      for (const size of sizesB) {
        await variant(storeId, productB.id, {
          name: `${color} / ${size}`,
          attributes: { color, size },
          sku: `SH-${roman(variantIndex)}-${size}`,
          price: 650_00 + variantIndex * 30_00,
        });
        variantIndex += 1;
      }
    }
    await attachImages(storeId, productB.id, 10, 'B');

    // --- Large gallery product: 100+ media records ---------------------------
    const productL = await product(
      storeId,
      'منتج معرض كبير',
      'Large Gallery Product',
      null,
      'Stress-test product for gallery pagination',
      'large-gallery-product',
    );
    await attachImages(storeId, productL.id, LARGE_GALLERY_COUNT, 'L');

    // --- Inventory per variant (Product A) ----------------------------------
    const variantsA = await prisma.productVariant.findMany({
      where: { storeId, productId: productA.id },
    });
    let onHand = 20;
    for (const variant of variantsA) {
      await prisma.inventory.upsert({
        where: { variantId: variant.id },
        create: {
          storeId,
          variantId: variant.id,
          onHandQuantity: onHand,
          reservedQuantity: onHand > 5 ? 2 : 0,
        },
        update: { onHandQuantity: onHand },
      });
      onHand -= 2;
    }

    const mediaCount = await prisma.productMedia.count({ where: { storeId } });
    console.log(`Seeded: store=${store.slug}`);
    console.log(`  Product A: ${variantsA.length} variants, 6 images`);
    console.log(`  Product B: 4 variants, 10 images`);
    console.log(`  Large Gallery Product: ${LARGE_GALLERY_COUNT} media`);
    console.log(`  Total media links: ${mediaCount}`);
    console.log(`Storefront URL: /store/${store.slug}`);
  } finally {
    if (!KEEP) {
      // The store FK graph cascades to products/variants/categories; media rows
      // are RESTRICT-linked from product_media, so delete links first.
      await prisma.productMedia.deleteMany({ where: { storeId } });
      await prisma.media.deleteMany({ where: { storeId } });
      await prisma.store.delete({ where: { id: storeId } });
      console.log('Cleaned up the test store (pass --keep to retain it).');
    }
    await prisma.$disconnect();
  }
}

function category(
  storeId: string,
  nameAr: string,
  nameEn: string,
  slug: string,
): Promise<{ id: string }> {
  return prisma.category.create({
    data: { storeId, name: nameEn, nameAr, nameEn, slug, status: 'ACTIVE' },
    select: { id: true },
  });
}

function product(
  storeId: string,
  nameAr: string,
  nameEn: string,
  descAr: string | null,
  descEn: string | null,
  slug: string,
): Promise<{ id: string }> {
  return prisma.product.create({
    data: {
      storeId,
      name: nameEn,
      nameAr,
      nameEn,
      description: descEn ?? descAr,
      slug,
      status: ProductStatus.ACTIVE,
    },
    select: { id: true },
  });
}

function linkProduct(
  storeId: string,
  productId: string,
  categoryIds: string[],
): Promise<Prisma.BatchPayload> {
  return prisma.productCategory.createMany({
    data: categoryIds.map((categoryId) => ({ storeId, productId, categoryId })),
  });
}

function variant(
  storeId: string,
  productId: string,
  data: { name: string; attributes: Record<string, string>; sku: string; price: number },
): Promise<{ id: string }> {
  return prisma.productVariant.create({
    data: {
      storeId,
      productId,
      name: data.name,
      attributes: data.attributes,
      sku: data.sku,
      price: BigInt(data.price),
      status: VariantStatus.ACTIVE,
    },
    select: { id: true },
  });
}

/**
 * Creates `count` media metadata rows for the product + product_media links.
 * The binaries are NOT uploaded (synthetic storage_path); this seeds the
 * METADATA gallery so pagination/order/primary work at scale. Returns the
 * created product_media ids (first = product-level primary candidate).
 */
async function attachImages(
  storeId: string,
  productId: string,
  count: number,
  prefix: string,
): Promise<string[]> {
  const created: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const media = await prisma.media.create({
      data: {
        storeId,
        storagePath: `catalog-gallery-seed/${storeId}/${productId}/${prefix}-${index}.png`,
        mediaType: 'IMAGE',
        mimeType: 'image/png',
        sizeBytes: BigInt(2048 + index * 64),
        altText: `${prefix} image ${index + 1}`,
      },
      select: { id: true },
    });
    const link = await prisma.productMedia.create({
      data: { storeId, productId, mediaId: media.id, sortOrder: index },
      select: { id: true },
    });
    created.push(link.id);
  }
  return created;
}

function roman(value: number): string {
  const numerals: Array<[number, string]> = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let result = '';
  let remainder = value;
  for (const [number, numeral] of numerals) {
    while (remainder >= number) {
      result += numeral;
      remainder -= number;
    }
  }
  return result;
}

void main().catch((error) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

