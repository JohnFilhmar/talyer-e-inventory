import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    // Disable image optimization in development to allow localhost/private IPs
    unoptimized: isDev,
    remotePatterns: [
      {
        // Local development backend
        protocol: 'http',
        hostname: 'localhost',
        port: '5000',
        pathname: '/uploads/**',
      },
      {
        // Alternative localhost
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '5000',
        pathname: '/uploads/**',
      },
      // Add production patterns here when deploying:
      // {
      //   protocol: 'https',
      //   hostname: 'api.yourdomain.com',
      //   pathname: '/uploads/**',
      // },
    ],
  },
};

export default nextConfig;
