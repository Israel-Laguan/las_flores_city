import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@las-flores/shared', '@las-flores/ui'],
  async rewrites() {
    return [
      {
        source: '/assets/:path*',
        destination: 'http://las-flores-server:3000/assets/:path*',
      },
    ];
  },
};

export default nextConfig;
