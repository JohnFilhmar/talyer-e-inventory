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

const nextConfig: NextConfig = {
  output: 'standalone',
  reactCompiler: true,
  images: {
    unoptimized: isDev,
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
