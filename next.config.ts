import type { NextConfig } from "next";

// Sin cacheComponents: toda la app está detrás del login y es dinámica.
const nextConfig: NextConfig = {
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
