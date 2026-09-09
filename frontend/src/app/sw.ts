import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from 'serwist';
import { CacheFirst, ExpirationPlugin, Serwist, StaleWhileRevalidate } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Runtime caching, deliberately narrow.
 *
 * Serwist's `defaultCache` includes a `cross-origin` rule and an `apis` rule
 * that cache same- and cross-origin requests by URL alone. On a shared counter
 * tablet that is a shared bucket: one user's API responses, keyed only by URL,
 * are served to whoever logs in next. The service worker sits below the
 * Authorization header, so it cannot tell the two sessions apart.
 *
 * Only assets are cached here: fonts, images and the build's own static
 * output. Nothing that carries a session. The IndexedDB mirror already covers
 * the offline data need, per-user and cleared on logout, which is why no API
 * rule is wanted rather than merely dropped.
 */
const runtimeCaching: RuntimeCaching[] = [
  {
    matcher: ({ request }) => request.destination === 'font',
    handler: new CacheFirst({
      cacheName: 'static-font-assets',
      plugins: [new ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 7 * 24 * 60 * 60 })],
    }),
  },
  {
    matcher: ({ request, url }) =>
      request.destination === 'image' && url.origin === self.location.origin,
    handler: new StaleWhileRevalidate({
      cacheName: 'static-image-assets',
      plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 24 * 60 * 60 })],
    }),
  },
  {
    matcher: ({ request, url }) =>
      url.origin === self.location.origin &&
      (request.destination === 'style' || request.destination === 'script'),
    handler: new StaleWhileRevalidate({
      cacheName: 'static-build-assets',
      plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 24 * 60 * 60 })],
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  // Any navigation the network cannot serve falls back to this route, which
  // is precached. Without it, a hard reload while offline shows the browser's
  // dinosaur instead of the app.
  fallbacks: {
    entries: [{ url: '/offline', matcher: ({ request }) => request.destination === 'document' }],
  },
});

serwist.addEventListeners();
