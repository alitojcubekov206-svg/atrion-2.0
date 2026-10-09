import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  async redirects() {
    return [{source: "/forma/:path*", destination: process.env.NODE_ENV === "development" ? "/playground/interior" : "/dashboard/design", permanent: false}];
  },
};

export default nextConfig;
