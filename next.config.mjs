/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath: '/converter',
  assetPrefix: '/converter',
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  transpilePackages: ['@unionam/shared-ui', '@unionam/shared-i18n'],
};

export default nextConfig;
