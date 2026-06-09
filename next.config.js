/** @type {import('next').NextConfig} */
const nextConfig = {
  // A custom server (server.js) handles WebSocket upgrades, so we run Next via
  // its programmatic API rather than the standalone output server.
  reactStrictMode: true,
  // better-sqlite3 is a native module; keep it external to the server bundle.
  serverExternalPackages: ['better-sqlite3'],
  poweredByHeader: false,
};

module.exports = nextConfig;
