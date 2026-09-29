import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildProductsUrl,
  CatalogUnavailableError,
  getPublicProduct,
  getPublicProducts,
} from './catalogApi';
import { catalogHref } from './catalogHref';
import { formatFitment } from './formatFitment';

const ID = '507f1f77bcf86cd799439011';
const product = {
  _id: ID,
  name: 'Brake Pad',
  description: '',
  brand: 'Yamaha',
  productModel: '',
  category: { _id: ID, name: 'Brakes' },
  motorcycleModels: [],
  images: [],
  primaryImage: null,
  sellingPrice: 150,
  availableAt: 2,
};

const respond = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildProductsUrl', () => {
  it('maps page params to backend names and drops defaults', () => {
    expect(
      buildProductsUrl(
        { search: 'pad', category: ID, motorcycle_model: ID, sort: 'price_asc', page: 2 },
        'http://api'
      )
    ).toBe(`http://api/public/products?search=pad&category=${ID}&motorcycleModel=${ID}&sort=price_asc&page=2`);
    expect(buildProductsUrl({ page: 1 }, 'http://api')).toBe('http://api/public/products');
  });

  it('drops malformed ids so a bad link shows the unfiltered catalog', () => {
    expect(buildProductsUrl({ category: 'abc', motorcycle_model: 'x,y' }, 'http://api')).toBe(
      'http://api/public/products'
    );
  });
});

describe('getPublicProducts', () => {
  it('parses a valid page', async () => {
    vi.stubGlobal(
      'fetch',
      respond(200, { success: true, data: [product], pagination: { page: 1, limit: 24, total: 1, pages: 1 } })
    );
    const page = await getPublicProducts({});
    expect(page.data[0].name).toBe('Brake Pad');
  });

  it('rejects a response of the wrong shape', async () => {
    vi.stubGlobal('fetch', respond(200, { success: true, data: [{ name: 'x' }] }));
    await expect(getPublicProducts({})).rejects.toBeInstanceOf(CatalogUnavailableError);
  });

  it('rejects when the backend is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(getPublicProducts({})).rejects.toBeInstanceOf(CatalogUnavailableError);
  });
});

describe('getPublicProduct', () => {
  it('returns null on 404 and for a malformed id without fetching', async () => {
    const fetchMock = respond(404, { success: false });
    vi.stubGlobal('fetch', fetchMock);
    expect(await getPublicProduct(ID)).toBeNull();
    expect(await getPublicProduct('nope')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('catalogHref and formatFitment', () => {
  it('builds catalog links in page-URL names', () => {
    expect(catalogHref({})).toBe('/catalog');
    expect(catalogHref({ search: 'oil', motorcycle_model: ID, sort: 'newest', page: 3 })).toBe(
      `/catalog?search=oil&motorcycle_model=${ID}&page=3`
    );
  });

  it('formats a fitment with and without years', () => {
    expect(formatFitment({ _id: ID, make: 'Honda', model: 'Click 125i', yearFrom: 2018, yearTo: 2023 })).toBe(
      'Honda Click 125i (2018-2023)'
    );
    expect(formatFitment({ _id: ID, make: 'Honda', model: 'Beat', yearFrom: 2020, yearTo: null })).toBe(
      'Honda Beat (2020 onward)'
    );
    expect(formatFitment({ _id: ID, make: 'Honda', model: 'Wave', yearFrom: null, yearTo: null })).toBe(
      'Honda Wave'
    );
  });
});
