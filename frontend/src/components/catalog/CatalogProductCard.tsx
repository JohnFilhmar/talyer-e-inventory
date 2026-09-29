import Image from 'next/image';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { formatCurrency } from '@/types/service';
import { resolveImageUrl } from '@/lib/images/resolveImageUrl';
import { formatFitment } from '@/lib/public/formatFitment';
import type { PublicProduct } from '@/utils/validators/publicCatalog';

/** Props for {@link CatalogProductCard}. */
export interface CatalogProductCardProps {
  /** The product to show; the whole card links to its page. */
  product: PublicProduct;
}

const availabilityLabel = (count: number): string =>
  count === 0 ? 'Out of stock' : `Available at ${count} ${count === 1 ? 'branch' : 'branches'}`;

const fitmentSummary = (product: PublicProduct): string | null => {
  const [first, ...rest] = product.motorcycleModels;
  if (!first) return null;
  return rest.length === 0 ? formatFitment(first) : `${formatFitment(first)} and ${rest.length} more`;
};

/** A public catalog card: image, name, brand, fitment, price and availability. */
export function CatalogProductCard({ product }: CatalogProductCardProps) {
  const image = product.primaryImage ? resolveImageUrl(product.primaryImage) : null;
  const fitment = fitmentSummary(product);

  return (
    <Link
      href={`/catalog/${product._id}`}
      className="flex h-full min-w-0 flex-col rounded-lg border border-gray-200 bg-white hover:border-yellow-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
    >
      <div className="relative aspect-square w-full rounded-t-lg bg-gray-100">
        {image ? (
          <Image
            src={image}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
            className="rounded-t-lg object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Package className="h-12 w-12 text-gray-400" aria-hidden="true" />
          </div>
        )}
      </div>
      {/* min-w-0 above and wrap-break-word here: one long unbroken word (a part
          code, a model name) otherwise widens the grid column past a 320px
          screen, since grid items default to min-width: auto. */}
      <div className="flex flex-1 flex-col p-4 wrap-break-word">
        {product.category && (
          <p className="text-xs font-medium uppercase text-gray-500">{product.category.name}</p>
        )}
        <h3 className="mt-1 line-clamp-2 text-base font-bold text-black">{product.name}</h3>
        {product.brand && <p className="text-sm text-gray-500">{product.brand}</p>}
        {fitment && <p className="mt-1 text-xs text-gray-500">Fits {fitment}</p>}
        <p className="mt-auto pt-2 text-lg font-bold text-black">{formatCurrency(product.sellingPrice)}</p>
        <p className="text-sm font-medium text-black">{availabilityLabel(product.availableAt)}</p>
      </div>
    </Link>
  );
}
