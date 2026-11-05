import type { NextConfig } from "next";

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
  // Browsers that have seen this use HTTPS only for a year, so nobody on the same WiFi can
  // read a login. Browsers ignore it on http://localhost. No includeSubDomains: other
  // sites on the same domain may not have HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  // Only the parts that can't break scripts or ads: no injected <base> or plugins, no framing.
  // A full script allow-list needs per-request nonces, which conflict with static page parts.
  { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
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
    return [
      { source: "/:path*", headers: securityHeaders },
      // API answers are private: no browser or CDN may keep a copy (the back button on a shared computer).
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      // Always re-check the service worker, so a new version reaches users right away.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
