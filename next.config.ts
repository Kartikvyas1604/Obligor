import type { NextConfig } from "next";

/**
 * Security headers applied to every response. CSP deliberately allows
 * inline styles (Tailwind runtime) and the Fontshare font stylesheet;
 * it forbids script injection, framing, and x-domain form posts.
 */
const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // HSTS is meaningful only over HTTPS; skip it on plain-HTTP dev servers.
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js hydration requires inline bootstrap
      "style-src 'self' 'unsafe-inline' https://api.fontshare.com",
      "font-src 'self' https://api.fontshare.com data:",
      "img-src 'self' data:",
      "connect-src 'self' https://hermes.pyth.network https://api.fontshare.com",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
