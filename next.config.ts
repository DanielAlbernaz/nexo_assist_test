import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App 100% autenticado e dinâmico (sessão por cookie): sem cacheComponents.
  // Esconde o botão "N" do Next em desenvolvimento, que cobria o rodapé da barra lateral.
  devIndicators: false,
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
