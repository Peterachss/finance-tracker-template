import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The commit this build came from, for the "new version available" check.
  env: { NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "" },
  // No floating "N" badge in development.
  devIndicators: false,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
