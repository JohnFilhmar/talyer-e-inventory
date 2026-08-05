import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const isDev = process.env.NODE_ENV === 'development';

/**
 * The backend that serves /uploads. Set NEXT_PUBLIC_IMAGE_HOST to the API's
 * origin (e.g. https://api.example.com) when deploying; without it only the
 * local development backend is allowed.
 */
const imageHost = process.env.NEXT_PUBLIC_IMAGE_HOST;

const remotePatterns: NonNullable<NonNullable<NextConfig['images']>['remotePatterns']> = [
  { protocol: 'http', hostname: 'localhost', port: '5000', pathname: '/uploads/**' },
  { protocol: 'http', hostname: '127.0.0.1', port: '5000', pathname: '/uploads/**' },
  { protocol: 'http', hostname: 'backend', port: '5000', pathname: '/uploads/**' },
];

if (imageHost) {
  try {
    const parsed = new URL(imageHost);
    remotePatterns.push({
      protocol: parsed.protocol.replace(':', '') as 'http' | 'https',
      hostname: parsed.hostname,
      ...(parsed.port ? { port: parsed.port } : {}),
      pathname: '/uploads/**',
    });
  } catch {
    console.warn(
      `NEXT_PUBLIC_IMAGE_HOST is set to an invalid URL (${imageHost}); ignoring it and falling back to the built-in local/backend image patterns.`
    );
  }
}

/**
 * True when the configured image host is a loopback address.
 *
 * Next's image optimizer refuses to fetch loopback and private addresses —
 * `images.dangerouslyAllowLocalIP` defaults to `false` — and it does so
 * *regardless* of whether a `remotePatterns` entry matches. So a local stack
 * whose uploads live on http://localhost:5000 gets `400 "url" parameter is
 * not allowed` for every product image, even though the pattern above allows
 * it. Bypassing the optimizer for those hosts is the right trade: optimization
 * is worthless against a machine-local backend anyway, and the alternative —
 * setting dangerouslyAllowLocalIP — would let anyone who can reach the app ask
 * it to fetch arbitrary internal addresses on their behalf.
 *
 * Production, which points at a real hostname, keeps optimization.
 */
const isLoopbackImageHost = (() => {
  if (!imageHost) return false;
  try {
    const { hostname } = new URL(imageHost);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
})();

const nextConfig: NextConfig = {
  output: 'standalone',
  reactCompiler: true,
  images: {
    unoptimized: isDev || isLoopbackImageHost,
    remotePatterns,
  },
};

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  // The service worker aggressively caches; running it in `next dev` makes
  // every code change look like it did not apply.
  disable: isDev,
});

export default withSerwist(nextConfig);
