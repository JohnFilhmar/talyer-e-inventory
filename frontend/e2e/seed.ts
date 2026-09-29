import { request, type APIRequestContext } from '@playwright/test';

/** Backend API base the seed writes through. */
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:5000/api';

/** Ids and names of everything one seed run created. */
export interface SeededCatalog {
  /** Token unique to this run, embedded in every name so runs never collide. */
  run: string;
  /** Prefix of every product name in this run, for searching the run alone. */
  prefix: string;
  brakesCategory: { id: string; name: string };
  fitment: { id: string; make: string; label: string };
  fitted: { id: string; name: string };
  withImage: { id: string; name: string };
  plain: { id: string; name: string };
  reserved: { id: string; name: string };
  discontinued: { id: string; name: string };
  branchA: string;
  branchB: string;
  /** Products this run lists publicly (discontinued excluded). */
  listedCount: number;
}

/** A 1x1 PNG, enough for the upload pipeline to store and serve an image. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

const idOf = (value: unknown): string => {
  if (value !== null && typeof value === 'object' && '_id' in value && typeof value._id === 'string') {
    return value._id;
  }
  throw new Error(`Expected a document with _id, got ${JSON.stringify(value)}`);
};

const send = async <T>(
  api: APIRequestContext,
  method: 'post' | 'put',
  path: string,
  data: Record<string, unknown>
): Promise<T> => {
  const response = await api[method](`${API_URL}${path}`, { data });
  const body: Envelope<T> = await response.json();
  if (!response.ok()) throw new Error(`${method.toUpperCase()} ${path} answered ${response.status()}: ${body.message}`);
  return body.data;
};

/**
 * Creates a small, self-contained catalog through the real admin API: two
 * branches, a category, a motorcycle model, 24 filler products for paging, and
 * five products covering the cases the public pages have to render. Specials
 * are created last so they are among the newest eight the landing page shows.
 */
export const seedCatalog = async (): Promise<SeededCatalog> => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD');

  const anonymous = await request.newContext();
  const login = await anonymous.post(`${API_URL}/auth/login`, { data: { email, password } });
  const loginBody: Envelope<{ token?: string; accessToken?: string }> = await login.json();
  await anonymous.dispose();
  const token = loginBody.data.token ?? loginBody.data.accessToken;
  if (!login.ok() || !token) throw new Error(`Admin login failed: ${login.status()} ${loginBody.message}`);

  const api = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  const run = Date.now().toString(36).toUpperCase();
  const prefix = `E2E ${run}`;

  const branch = async (suffix: string) =>
    idOf(
      await send(api, 'post', '/branches', {
        name: `${prefix} Branch ${suffix}`,
        code: `E2E${run}${suffix}`.slice(0, 20),
        address: { street: '1 Test St', city: `City ${suffix}`, province: 'Laguna', postalCode: '4000', country: 'Philippines' },
        contact: { phone: '09171234567', email: `e2e-${run.toLowerCase()}-${suffix.toLowerCase()}@example.com` },
      })
    );
  const branchA = await branch('A');
  const branchB = await branch('B');

  const brakesName = `${prefix} Brakes`;
  const brakes = idOf(await send(api, 'post', '/categories', { name: brakesName, code: `E2E-${run}-BRK` }));
  const oils = idOf(await send(api, 'post', '/categories', { name: `${prefix} Oils`, code: `E2E-${run}-OIL` }));

  const make = `E2EMAKE${run}`;
  const fitmentId = idOf(await send(api, 'post', '/motorcycle-models', { make, model: 'Zoomer', yearFrom: 2018, yearTo: 2023 }));

  const product = async (name: string, extra: Record<string, unknown>) =>
    idOf(await send(api, 'post', '/products', { name, costPrice: 100, sellingPrice: 150, ...extra }));
  const restock = (productId: string, branchId: string, quantity: number, reorderPoint: number) =>
    send(api, 'post', '/stock/restock', { product: productId, branch: branchId, quantity, reorderPoint });

  for (let i = 1; i <= 24; i += 1) {
    const id = await product(`${prefix} Filler ${String(i).padStart(2, '0')}`, {
      category: oils,
      costPrice: 10,
      sellingPrice: 200 + i,
    });
    await restock(id, branchA, 5, 1);
  }

  const discontinuedName = `${prefix} Old Part`;
  const discontinued = await product(discontinuedName, { category: brakes });
  await send(api, 'put', `/products/${discontinued}`, { isDiscontinued: true });

  const reservedName = `${prefix} Chain`;
  const reserved = await product(reservedName, { category: brakes, sellingPrice: 80 });
  await restock(reserved, branchA, 1, 0);
  await send(api, 'post', '/sales', {
    branch: branchA,
    customer: { name: 'Walk-in', phone: '09171234567' },
    items: [{ product: reserved, quantity: 1 }],
    paymentMethod: 'cash',
  });

  const plainName = `${prefix} Bolt`;
  const plain = await product(plainName, { category: brakes, sellingPrice: 20 });

  const imageName = `${prefix} Headlight`;
  const withImage = await product(imageName, { category: oils, brand: 'Osram', sellingPrice: 450 });
  const upload = await api.post(`${API_URL}/products/${withImage}/images`, {
    multipart: { image: { name: 'pixel.png', mimeType: 'image/png', buffer: PIXEL_PNG } },
  });
  if (!upload.ok()) throw new Error(`Image upload answered ${upload.status()}`);
  await restock(withImage, branchA, 3, 1);

  const fittedName = `${prefix} Brake Pad`;
  const fitted = await product(fittedName, {
    category: brakes,
    brand: 'Yamaha',
    productModel: 'BP-E2E',
    description: 'Front brake pad set.\nCeramic compound.',
    motorcycleModels: [fitmentId],
  });
  await restock(fitted, branchA, 10, 2);
  await restock(fitted, branchB, 2, 2);

  await api.dispose();

  return {
    run,
    prefix,
    brakesCategory: { id: brakes, name: brakesName },
    fitment: { id: fitmentId, make, label: `${make} Zoomer (2018-2023)` },
    fitted: { id: fitted, name: fittedName },
    withImage: { id: withImage, name: imageName },
    plain: { id: plain, name: plainName },
    reserved: { id: reserved, name: reservedName },
    discontinued: { id: discontinued, name: discontinuedName },
    branchA,
    branchB,
    listedCount: 28,
  };
};
