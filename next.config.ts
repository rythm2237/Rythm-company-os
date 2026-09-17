import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", has: [{ type: "host", value: "2nya-nailart.rythm-os.com" }], destination: "/api/2nya-nailart/site" },
        { source: "/admin", has: [{ type: "host", value: "2nya-nailart.rythm-os.com" }], destination: "/2nya-nailart/admin.html" },
        { source: "/nail-care", has: [{ type: "host", value: "2nya-nailart.rythm-os.com" }], destination: "/2nya-nailart/nail-care.html" },
        { source: "/booking/:id", has: [{ type: "host", value: "2nya-nailart.rythm-os.com" }], destination: "/2nya-nailart/booking.html?id=:id" },
        { source: "/assets/:path*", has: [{ type: "host", value: "2nya-nailart.rythm-os.com" }], destination: "/api/2nya-nailart/media/:path*" },
        { source: "/2nya-nailart/assets/:path*", has: [{ type: "host", value: "2nya-nailart.rythm-os.com" }], destination: "/api/2nya-nailart/media/:path*" },
        { source: "/manifest.webmanifest", has: [{ type: "host", value: "2nya-nailart.rythm-os.com" }], destination: "/2nya-nailart/manifest.webmanifest" },
        { source: "/sw.js", has: [{ type: "host", value: "2nya-nailart.rythm-os.com" }], destination: "/2nya-nailart/sw.js" },
      ],
    };
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "company.rythm-os.com" }],
        destination: "https://rythm-os.com/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.rythm-os.com" }],
        destination: "https://rythm-os.com/:path*",
        permanent: true,
      },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
