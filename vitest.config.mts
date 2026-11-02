import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // tests/db necesita el Supabase local: se corren con `npm run test:db`
    exclude: ["tests/db/**", "node_modules/**"],
    environment: "node",
  },
});
