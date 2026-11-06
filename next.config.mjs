/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
  serverExternalPackages: ["pg", "razorpay"],
  // Ship the font files the share image reads at runtime
  outputFileTracingIncludes: { "/opengraph-image": ["./node_modules/@fontsource/ibm-plex-sans/files/*.woff"], "/twitter-image": ["./node_modules/@fontsource/ibm-plex-sans/files/*.woff"] },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Long lived browser caching for static brand assets
      { source: "/icons/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/icon.svg", headers: [{ key: "Cache-Control", value: "public, max-age=604800" }] },
      // The service worker must always be revalidated so updates reach users
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default nextConfig;
