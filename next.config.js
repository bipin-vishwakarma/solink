/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    // Never serve stale HTML for the app pages (hashed JS/CSS under /_next/static
    // stay immutably cached). This prevents the browser from clinging to old code
    // after a deploy, which was hiding fixes behind a cache.
    const noStore = [{ key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" }];
    return [
      { source: "/", headers: noStore },
      { source: "/settings", headers: noStore },
      { source: "/profile", headers: noStore },
    ];
  },
};

module.exports = nextConfig;
