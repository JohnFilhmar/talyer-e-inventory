import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Package } from 'lucide-react';
import { BranchAvailability } from '@/components/catalog';
import { getPublicProduct } from '@/lib/public/catalogApi';
import { formatFitment } from '@/lib/public/formatFitment';
import { resolveImageUrl } from '@/lib/images/resolveImageUrl';
import { formatCurrency } from '@/types/service';

type Params = Promise<{ product_id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const product = await getPublicProduct((await params).product_id);
  if (!product) return { title: 'Part not found | E-Talyer' };
  return {
    title: `${product.name} | E-Talyer`,
    description:
      product.description.slice(0, 160) ||
      `${product.name}, available at Joemar Motor Parts & Services.`,
    openGraph: { images: product.primaryImage ? [resolveImageUrl(product.primaryImage)] : [] },
  };
}

/** One public product: images, details, price and where it is stocked. */
export default async function CatalogProductPage({ params }: { params: Params }) {
  const product = await getPublicProduct((await params).product_id);
  if (!product) notFound();
  const image = product.primaryImage ? resolveImageUrl(product.primaryImage) : null;
  const byline = [product.brand, product.productModel].filter(Boolean).join(' · ');

  return (
    <>
      <Link href="/catalog" className="text-sm font-medium text-black underline">
        Back to catalog
      </Link>
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <div className="relative aspect-square w-full rounded-lg bg-gray-100">
          {image ? (
            <Image
              src={image}
              alt={product.name}
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="rounded-lg object-contain"
              priority
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Package className="h-16 w-16 text-gray-400" aria-hidden="true" />
            </div>
          )}
        </div>
        <div>
          {product.category && (
            <p className="text-sm font-medium uppercase text-gray-500">{product.category.name}</p>
          )}
          <h1 className="mt-1 text-2xl font-bold text-black">{product.name}</h1>
          {byline && <p className="mt-1 text-base text-gray-500">{byline}</p>}
          <p className="mt-4 text-2xl font-bold text-black">{formatCurrency(product.sellingPrice)}</p>
          <p className="mt-1 text-xs text-gray-500">Price may vary by branch; confirm at the counter.</p>
          {product.motorcycleModels.length > 0 && (
            <section className="mt-6">
              <h2 className="text-lg font-bold text-black">Fits</h2>
              <ul className="mt-2 list-inside list-disc text-base text-black">
                {product.motorcycleModels.map((model) => (
                  <li key={model._id}>{formatFitment(model)}</li>
                ))}
              </ul>
            </section>
          )}
          {product.description && (
            <section className="mt-6">
              <h2 className="text-lg font-bold text-black">Details</h2>
              <p className="mt-2 whitespace-pre-line text-base text-black">{product.description}</p>
            </section>
          )}
        </div>
      </div>
      <section className="mt-8">
        <h2 className="mb-4 text-xl font-bold text-black">Where to buy</h2>
        <BranchAvailability branches={product.branches} />
      </section>
    </>
  );
}
