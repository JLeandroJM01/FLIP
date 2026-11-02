import { expect, test } from "@playwright/test";
import { VIEWPORTS } from "../playwright.config";

for (const vp of VIEWPORTS) {
  test(`login en ${vp.name} px`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/login?error=no_permitido");
    await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();
    await expect(page.getByText(/no tiene acceso a FLIP/)).toBeVisible();
    await page.screenshot({ path: `e2e/screenshots/login-${vp.name}.png`, fullPage: true });
  });
}

test("sin sesión, cualquier pantalla manda al login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
