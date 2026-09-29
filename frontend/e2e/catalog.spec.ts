import { expect, test, type Page } from '@playwright/test';
import { API_URL, type SeededCatalog } from './seed';
import { readSeed } from './seedFile';

// Read in the worker, after global setup has written it; test collection can
// happen before global setup runs.
let seed: SeededCatalog;
test.beforeAll(() => {
  seed = readSeed();
});

/**
 * Public reads are cached for 60 seconds in Redis and again in Next's data
 * cache, by design, so data seeded seconds ago can take up to about two minutes
 * to appear in lists fetched before the seed (the landing page's newest eight,
 * the filter options). Reload until it does.
 */
const CACHE_CATCH_UP_MS = 150_000;

const reloadUntil = async (page: Page, path: string, check: () => Promise<void>) => {
  await expect(async () => {
    await page.goto(path);
    await check();
  }).toPass({ timeout: CACHE_CATCH_UP_MS, intervals: [5_000] });
};

const searchRun = (page: Page, extra = '') =>
  page.goto(`/catalog?search=${encodeURIComponent(seed.prefix)}${extra}`);

const cardNames = (page: Page) => page.locator('main a[href^="/catalog/"] h3').allInnerTexts();

const pesoValues = async (page: Page): Promise<number[]> => {
  const texts = await page.locator('main a[href^="/catalog/"] p', { hasText: '₱' }).allInnerTexts();
  return texts.map((text) => Number(text.replace(/[^\d.]/g, '')));
};

test.describe('landing page', () => {
  test('shows the newest real products in pesos and links into the catalog', async ({ page }) => {
    test.setTimeout(CACHE_CATCH_UP_MS + 30_000);
    const featured = page.locator('#products');
    await reloadUntil(page, '/', async () => {
      await expect(featured.getByText(seed.fitted.name)).toBeVisible({ timeout: 3_000 });
    });
    await expect(featured.getByRole('heading', { name: /Featured/ })).toBeVisible();
    await expect(featured.locator('a[href^="/catalog/"]')).toHaveCount(8);
    await expect(featured).not.toContainText('$');
    await expect(featured).toContainText('₱');
    await expect(featured.getByText(seed.discontinued.name)).toHaveCount(0);

    await featured.getByRole('link', { name: 'View All Products' }).click();
    await expect(page).toHaveURL(/\/catalog$/);
    await expect(page.getByRole('heading', { name: 'Parts catalog' })).toBeVisible();
  });

  test('navbar Catalog link works from the landing page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('link', { name: 'Catalog' }).first().click();
    await expect(page).toHaveURL(/\/catalog$/);
  });
});

test.describe('catalog listing', () => {
  test('lists the run, paginates 24 per page, and counts correctly', async ({ page }) => {
    await searchRun(page);
    await expect(page.getByText(`${seed.listedCount} parts.`)).toBeVisible();
    expect(await cardNames(page)).toHaveLength(24);
    await expect(page.getByText('Page 1 of 2')).toBeVisible();

    await page.getByRole('link', { name: 'Next' }).click();
    await expect(page).toHaveURL(/page=2/);
    expect(await cardNames(page)).toHaveLength(seed.listedCount - 24);
    await page.getByRole('link', { name: 'Previous' }).click();
    await expect(page.getByText('Page 1 of 2')).toBeVisible();
  });

  test('search box finds a part by the motorcycle it fits', async ({ page }) => {
    await page.goto('/catalog');
    await page.getByLabel('Search parts').fill(seed.fitment.make);
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL(new RegExp(`search=${seed.fitment.make}`));
    expect(await cardNames(page)).toEqual([seed.fitted.name]);
    await expect(page.getByText(`Fits ${seed.fitment.label}`)).toBeVisible();
  });

  test('category filter narrows and keeps the search', async ({ page }) => {
    test.setTimeout(CACHE_CATCH_UP_MS + 30_000);
    const category = page.getByRole('combobox', { name: 'Category' });
    const option = page.getByRole('option', { name: seed.brakesCategory.name });
    await reloadUntil(page, `/catalog?search=${encodeURIComponent(seed.prefix)}`, async () => {
      await category.click();
      await category.fill(seed.brakesCategory.name);
      await expect(option).toBeVisible({ timeout: 3_000 });
    });
    await option.click();
    await expect(page).toHaveURL(new RegExp(`category=${seed.brakesCategory.id}`));
    await expect(page).toHaveURL(/search=/);
    expect((await cardNames(page)).sort()).toEqual([seed.fitted.name, seed.plain.name, seed.reserved.name].sort());
  });

  test('fitment filter shows only parts for that motorcycle', async ({ page }) => {
    await page.goto(`/catalog?motorcycle_model=${seed.fitment.id}`);
    expect(await cardNames(page)).toEqual([seed.fitted.name]);
  });

  test('sort by price orders the page ascending', async ({ page }) => {
    await searchRun(page, '&sort=price_asc');
    const prices = await pesoValues(page);
    expect(prices.length).toBeGreaterThan(5);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    await expect(page.getByLabel('Sort by')).toHaveValue('price_asc');
  });

  test('a mangled category link shows the catalog, not an error', async ({ page }) => {
    await page.goto('/catalog?category=abc&motorcycle_model=zzz');
    await expect(page.getByRole('heading', { name: 'Parts catalog' })).toBeVisible();
    await expect(page.getByText('The catalog is unavailable right now')).toHaveCount(0);
  });

  test('a page past the end offers a way back', async ({ page }) => {
    await page.goto('/catalog?page=99');
    await expect(page.getByText('No parts on this page')).toBeVisible();
    await page.getByRole('link', { name: 'Show all parts' }).click();
    await expect(page).toHaveURL(/\/catalog$/);
  });

  test('a search with no match says so', async ({ page }) => {
    await page.goto('/catalog?search=zzzz-no-such-part-zzzz');
    await expect(page.getByText('No parts match these filters')).toBeVisible();
  });
});

test.describe('product page', () => {
  test('shows price, fitment, details and per-branch labels', async ({ page }) => {
    await page.goto(`/catalog/${seed.fitted.id}`);
    await expect(page.getByRole('heading', { level: 1, name: seed.fitted.name })).toBeVisible();
    await expect(page.getByText('₱150.00')).toBeVisible();
    await expect(page.getByText('Price may vary by branch; confirm at the counter.')).toBeVisible();
    await expect(page.getByText('Yamaha · BP-E2E')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: seed.fitment.label })).toBeVisible();
    await expect(page.getByText('Ceramic compound.')).toBeVisible();

    const branchA = page.getByRole('listitem').filter({ hasText: `${seed.prefix} Branch A` });
    const branchB = page.getByRole('listitem').filter({ hasText: `${seed.prefix} Branch B` });
    await expect(branchA).toContainText('In stock');
    await expect(branchB).toContainText('Low stock');
    await expect(branchA.getByRole('link', { name: '09171234567' })).toHaveAttribute('href', 'tel:09171234567');
    await expect(page).toHaveTitle(`${seed.fitted.name} | E-Talyer`);
  });

  test('a fully reserved product reads out of stock', async ({ page }) => {
    await page.goto(`/catalog/${seed.reserved.id}`);
    const branchA = page.getByRole('listitem').filter({ hasText: `${seed.prefix} Branch A` });
    await expect(branchA).toContainText('Out of stock');
  });

  test('a product with no stock, image or brand still renders cleanly', async ({ page }) => {
    await page.goto(`/catalog/${seed.plain.id}`);
    await expect(page.getByRole('heading', { level: 1, name: seed.plain.name })).toBeVisible();
    await expect(page.getByText('Not stocked at any branch right now.')).toBeVisible();
    await expect(page.locator('main img')).toHaveCount(0);
  });

  test('the uploaded image is served and shown', async ({ page }) => {
    await page.goto(`/catalog/${seed.withImage.id}`);
    const image = page.getByRole('img', { name: seed.withImage.name });
    await expect(image).toBeVisible();
    const loaded = await image.evaluate((node) => node instanceof HTMLImageElement && node.naturalWidth > 0);
    expect(loaded).toBe(true);
  });

  test('discontinued and malformed ids show the not-listed page', async ({ page }) => {
    for (const id of [seed.discontinued.id, 'not-an-id', '507f1f77bcf86cd799439099']) {
      await page.goto(`/catalog/${id}`);
      await expect(page.getByText('This part is no longer listed')).toBeVisible();
    }
  });

  test('back link returns to the catalog', async ({ page }) => {
    await page.goto(`/catalog/${seed.fitted.id}`);
    await page.getByRole('link', { name: 'Back to catalog' }).click();
    await expect(page).toHaveURL(/\/catalog$/);
  });
});

test.describe('no private data reaches the browser', () => {
  test('rendered pages and the public API carry no cost, margin or quantity', async ({ page, request }) => {
    for (const path of ['/', `/catalog?search=${encodeURIComponent(seed.prefix)}`, `/catalog/${seed.fitted.id}`]) {
      await page.goto(path);
      const html = await page.content();
      for (const field of ['costPrice', 'profitMargin', 'reservedQuantity', 'reorderPoint']) {
        expect(html, `${field} in ${path}`).not.toContain(field);
      }
    }
    const api = await request.get(`${API_URL}/public/products/${seed.fitted.id}`);
    const text = await api.text();
    for (const field of ['costPrice', 'profitMargin', 'quantity', 'reorderPoint']) {
      expect(text).not.toContain(`"${field}"`);
    }
  });
});

test.describe('small screens', () => {
  test.use({ viewport: { width: 320, height: 800 } });

  test('catalog fits 320px with a two-column grid', async ({ page }) => {
    await searchRun(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const cards = page.locator('main a[href^="/catalog/"]');
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    expect(first && second && Math.abs(first.y - second.y) < 2).toBe(true);
  });

  test('landing page fits 320px, products included', async ({ page }) => {
    // The About badge used to sit 8px past a 320px screen. The seed's
    // motorcycle make is also one long token, which would widen a product
    // card's grid column without min-w-0 and overflow-wrap on the card.
    test.setTimeout(CACHE_CATCH_UP_MS + 30_000);
    await reloadUntil(page, '/', async () => {
      await expect(page.locator('#products').getByText(seed.fitted.name)).toBeVisible({ timeout: 3_000 });
    });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('product page fits 320px', async ({ page }) => {
    await page.goto(`/catalog/${seed.fitted.id}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
