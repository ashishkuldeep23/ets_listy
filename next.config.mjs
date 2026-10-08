/** @type {import('next').NextConfig} */

// Basic security headers sent with every response.
const securityHeaders = [
  // Stop browsers guessing content types (MIME sniffing).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Block the app from being embedded in other sites (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Don't leak full URLs to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Listy needs none of these browser features.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Don't advertise the framework in the X-Powered-By header.
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
