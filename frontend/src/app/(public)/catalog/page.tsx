import type { Metadata } from 'next';
import Link from 'next/link';
import { CatalogFilters, CatalogPagination, CatalogProductCard } from '@/components/catalog';
import {
  getPublicCategories,
  getPublicMotorcycleModels,
  getPublicProducts,
} from '@/lib/public/catalogApi';
import type { CatalogQuery } from '@/types/catalog';

export const metadata: Metadata = {
  title: 'Parts catalog | E-Talyer',
  description: 'Motorcycle parts in stock at Joemar Motor Parts & Services branches.',
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const toQuery = (params: SearchParams): CatalogQuery => {
  const page = Number.parseInt(first(params.page) ?? '1', 10);
  return {
    search: first(params.search) || undefined,
    category: first(params.category) || undefined,
    motorcycle_model: first(params.motorcycle_model) || undefined,
    sort: first(params.sort) || undefined,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
};

/** The public parts catalog: filters, a grid of products and pagination. */
export default async function CatalogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = toQuery(await searchParams);
  const [listing, categories, motorcycleModels] = await Promise.all([
    getPublicProducts(query),
    getPublicCategories(),
    getPublicMotorcycleModels(),
  ]);
  const { total, page, pages } = listing.pagination;
  const filtered = Boolean(query.search || query.category || query.motorcycle_model);
  const pastTheEnd = page > 1 && total > 0;

  return (
    <>
      <h1 className="text-2xl font-bold text-black">Parts catalog</h1>
      <p className="mt-2 mb-6 text-base text-gray-500">
        {total} {total === 1 ? 'part' : 'parts'}. Prices may vary by branch; confirm at the counter.
      </p>
      <CatalogFilters categories={categories} motorcycleModels={motorcycleModels} current={query} />
      {listing.data.length > 0 ? (
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {listing.data.map((product) => (
            <CatalogProductCard key={product._id} product={product} />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-lg font-bold text-black">
            {pastTheEnd ? 'No parts on this page' : 'No parts match these filters'}
          </p>
          {(filtered || pastTheEnd) && (
            <Link
              href="/catalog"
              className="mt-4 inline-block rounded-lg bg-yellow-400 px-4 py-2 font-medium text-black"
            >
              Show all parts
            </Link>
          )}
        </div>
      )}
      <CatalogPagination query={query} page={page} pages={pages} />
    </>
  );
}
