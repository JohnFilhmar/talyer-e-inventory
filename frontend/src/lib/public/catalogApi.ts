import { z } from 'zod';
import type { CatalogQuery } from '@/types/catalog';
import {
  publicCategorySchema,
  publicMotorcycleModelSchema,
  publicProductDetailSchema,
  publicProductPageSchema,
  type PublicCategory,
  type PublicMotorcycleModel,
  type PublicProductDetail,
  type PublicProductPage,
} from '@/utils/validators/publicCatalog';

/** Seconds a catalog response may be served from Next's data cache. */
const REVALIDATE_SECONDS = 60;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/** The catalog could not be read: the backend is down or answered unexpectedly. */
export class CatalogUnavailableError extends Error {
  override name = 'CatalogUnavailableError';
}

/**
 * Backend base URL for server-side reads. Inside Docker `localhost` is the
 * frontend container itself, so `API_INTERNAL_URL` names the backend service;
 * outside Docker the public URL works.
 */
const apiBase = (): string =>
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

/**
 * Builds the backend URL for a listing query. Malformed ids are dropped rather
 * than sent, so a mangled link shows the unfiltered catalog instead of an error.
 *
 * @param query the page's query, in page-URL names
 * @param base backend base URL, defaulting to the server-side one
 */
export const buildProductsUrl = (query: CatalogQuery, base: string = apiBase()): string => {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.category && OBJECT_ID.test(query.category)) params.set('category', query.category);
  const fitment = (query.motorcycle_model ?? '').split(',').filter((id) => OBJECT_ID.test(id));
  if (fitment.length > 0) params.set('motorcycleModel', fitment.join(','));
  if (query.sort) params.set('sort', query.sort);
  if (query.page && query.page > 1) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  return `${base}/public/products${qs ? `?${qs}` : ''}`;
};

const readJson = async (url: string): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  } catch (error) {
    throw new CatalogUnavailableError(`Catalog request to ${url} failed: ${String(error)}`);
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new CatalogUnavailableError(`Catalog request to ${url} answered ${response.status}`);
  }
  const body: unknown = await response.json();
  return body;
};

const parse = <T>(schema: z.ZodType<T>, body: unknown, url: string): T => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new CatalogUnavailableError(`Catalog response from ${url} has an unexpected shape`);
  }
  return result.data;
};

/**
 * One page of the public listing.
 *
 * @throws CatalogUnavailableError when the backend is unreachable or the shape is wrong
 */
export const getPublicProducts = async (query: CatalogQuery): Promise<PublicProductPage> => {
  const url = buildProductsUrl(query);
  return parse(publicProductPageSchema, await readJson(url), url);
};

/**
 * One public product with its branch availability, or null when it is not
 * listed (unknown, inactive, discontinued or a malformed id).
 *
 * @throws CatalogUnavailableError when the backend is unreachable or the shape is wrong
 */
export const getPublicProduct = async (id: string): Promise<PublicProductDetail | null> => {
  if (!OBJECT_ID.test(id)) return null;
  const url = `${apiBase()}/public/products/${id}`;
  const body = await readJson(url);
  if (body === null) return null;
  return parse(z.object({ data: publicProductDetailSchema }), body, url).data;
};

/** Active categories for the listing filter. */
export const getPublicCategories = async (): Promise<PublicCategory[]> => {
  const url = `${apiBase()}/public/categories`;
  return parse(z.object({ data: z.array(publicCategorySchema) }), await readJson(url), url).data;
};

/** Motorcycle models for the fitment filter, sorted by make then model. */
export const getPublicMotorcycleModels = async (): Promise<PublicMotorcycleModel[]> => {
  const url = `${apiBase()}/public/motorcycle-models`;
  return parse(z.object({ data: z.array(publicMotorcycleModelSchema) }), await readJson(url), url).data;
};
