import { defineConfig } from "@playwright/test";

// Los tests corren contra el Supabase LOCAL. process.loadEnvFile no pisa variables ya
// cargadas, así que .env.development.local (local) gana sobre .env.local (nube).
for (const file of [".env.development.local", ".env.local"]) {
  try {
    process.loadEnvFile(file);
  } catch {}
}

// Capturas responsive (SPEC 13): 375 px (iPhone), 768 px (tablet), 1440 px (computadora).
export const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
] as const;

export const AUTH_FILE = "e2e/.auth/user.json";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    locale: "es-PE",
    timezoneId: "America/Lima",
    colorScheme: "dark",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "publico", testMatch: /login\.spec\.ts/, use: { browserName: "chromium" } },
    {
      name: "app",
      testIgnore: /login\.spec\.ts|auth\.setup\.ts/,
      dependencies: ["setup"],
      use: { browserName: "chromium", storageState: AUTH_FILE },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
