/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@fm-flow/ui-components'],
  // Proxy API calls to the flow_backend control-plane so the browser stays
  // same-origin (the backend has no CORS middleware). Override the target with
  // BACKEND_URL in other environments.
  async rewrites() {
    const backend = process.env.BACKEND_URL ?? 'http://localhost:8080'
    return [{ source: '/api/v1/:path*', destination: `${backend}/api/v1/:path*` }]
  },
}
module.exports = nextConfig
