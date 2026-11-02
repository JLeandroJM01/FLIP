import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Protección: estos tests escriben y borran datos. Solo contra el Supabase LOCAL, nunca la nube
// (ojo: si la terminal tiene exportadas las variables de .env.local, Node no las pisa).
const url = process.env.SUPABASE_URL ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
  throw new Error(`test:db se niega a correr: SUPABASE_URL no es local (${url || "vacía"})`);
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // "server-only" lanza error fuera de React Server Components; en tests no aplica.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
  },
});
