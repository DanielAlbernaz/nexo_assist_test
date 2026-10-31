import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App 100% autenticado e dinâmico (sessão por cookie): sem cacheComponents.
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
