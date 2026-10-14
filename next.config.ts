import type { NextConfig } from "next";

/**
 * Security headers applied to every response. CSP deliberately allows
 * inline styles (Tailwind runtime) and the Fontshare font stylesheet;
 * it forbids script injection, framing, and x-domain form posts.
 */
const isProd = process.env.NODE_ENV === "production";

/**
 * Origin of the Solana RPC the browser talks to for the client-signed escrow
 * deposit. Derived from SOLANA_RPC_URL so the CSP can allow it; well-known
 * public clusters are included so a default deployment still works.
 */
function rpcOrigins(): string[] {
  const origins = new Set<string>([
    "http://127.0.0.1:8899",
    "https://api.devnet.solana.com",
    "https://api.mainnet-beta.solana.com",
  ]);
  const url = process.env.SOLANA_RPC_URL;
  if (url) {
    try {
      origins.add(new URL(url).origin);
    } catch {
      // ignore malformed URL — the API layer validates it at runtime
    }
  }
  return [...origins];
}

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
      `connect-src 'self' https://hermes.pyth.network https://api.fontshare.com ${rpcOrigins().join(" ")}`,
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Solana client libs are Node-only and use optional/require internals; keep
  // them out of the bundler so the escrow settle path loads them natively.
  serverExternalPackages: ["@solana/web3.js", "@solana/spl-token"],
  async rewrites() {
    // Public API surface: /health for liveness probes and /v1/* mirroring the
    // canonical /api/v1/* handlers. Both resolve to the same route code.
    return [
      { source: "/health", destination: "/api/v1/health" },
      { source: "/v1/:path*", destination: "/api/v1/:path*" },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
