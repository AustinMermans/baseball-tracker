/** @type {import('next').NextConfig} */
const isStatic = process.env.STATIC_EXPORT === 'true';

const nextConfig = {
  ...(isStatic ? {
    output: 'export',
    basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
    images: { unoptimized: true },
  } : {
    serverExternalPackages: ['better-sqlite3'],
  }),
};

export default nextConfig;
