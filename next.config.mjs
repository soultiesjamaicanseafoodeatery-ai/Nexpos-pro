/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone: bundles the app + minimal Node.js server for Electron packaging
  // Vercel ignores this setting and handles its own deployment
  output: 'standalone',
}

export default nextConfig
