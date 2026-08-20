/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    // Never serve stale HTML for the app pages (hashed JS/CSS under /_next/static
    // stay immutably cached). This prevents the browser from clinging to old code
    // after a deploy, which was hiding fixes behind a cache.
    const appHeaders = [
      { key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      },
    ];
    return [
      { source: "/", headers: appHeaders },
      { source: "/settings", headers: appHeaders },
      { source: "/profile", headers: appHeaders },
    ];
  },
};

module.exports = nextConfig;
