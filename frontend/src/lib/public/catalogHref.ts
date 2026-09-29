import type { CatalogQuery } from '@/types/catalog';

/**
 * A `/catalog` link for a query, in page-URL names. Defaults (page 1, newest)
 * are left out so the canonical link stays short.
 */
export const catalogHref = (query: CatalogQuery): string => {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.category) params.set('category', query.category);
  if (query.motorcycle_model) params.set('motorcycle_model', query.motorcycle_model);
  if (query.sort && query.sort !== 'newest') params.set('sort', query.sort);
  if (query.page && query.page > 1) params.set('page', String(query.page));
  const qs = params.toString();
  return qs ? `/catalog?${qs}` : '/catalog';
};
