/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@las-flores/shared'],
  async rewrites() {
    return [
      {
        source: '/assets/:path*',
        destination: 'http://las-flores-server:3000/assets/:path*',
      },
    ];
  },
}

module.exports = nextConfig
