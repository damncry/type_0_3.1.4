/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  assetPrefix: '.',
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true },
}

export default nextConfig
