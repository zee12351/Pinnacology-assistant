import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: '/home/:path*',
        destination: '/',
      },
    ];
  },
};

export default nextConfig;
