import type { NextConfig } from "next";

// Sin cacheComponents: toda la app está detrás del login y es dinámica.
const nextConfig: NextConfig = {
  devIndicators: false,
  // Volver a una pantalla vista hace menos de 30 s es instantáneo; guardar algo la refresca igual
  // (las Server Actions llaman a revalidatePath).
  experimental: { staleTimes: { dynamic: 30 } },
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
