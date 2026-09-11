/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The link-preview image is drawn by satori, which needs the font files at
  // request time. Naming them keeps them in the serverless bundle instead of
  // being traced away as unreferenced assets.
  outputFileTracingIncludes: {
    '/track/[slug]/opengraph-image': ['./src/fonts/*.ttf'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default nextConfig;
