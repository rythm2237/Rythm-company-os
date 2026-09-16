import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", has: [{ type: "host", value: "2nya-nailart.rythm-os.com" }], destination: "/2nya-nailart/index.html" },
        { source: "/admin", has: [{ type: "host", value: "2nya-nailart.rythm-os.com" }], destination: "/2nya-nailart/admin.html" },
        { source: "/booking/:path*", has: [{ type: "host", value: "2nya-nailart.rythm-os.com" }], destination: "/2nya-nailart/booking.html" },
        { source: "/manifest.webmanifest", has: [{ type: "host", value: "2nya-nailart.rythm-os.com" }], destination: "/2nya-nailart/manifest.webmanifest" },
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
