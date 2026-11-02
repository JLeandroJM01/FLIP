import { expect, test, type Page } from "@playwright/test";
import { VIEWPORTS } from "../playwright.config";
import { cleanupE2EData, E2E_MARK } from "./helpers";

test.describe.configure({ mode: "serial" });
test.beforeAll(cleanupE2EData);
test.afterAll(cleanupE2EData);

const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true });

test("celular: registro un gasto en efectivo en < 5 s y lo veo en el Inicio (Fase 1)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();

  const start = Date.now();
  await page.getByRole("button", { name: "Registrar" }).click(); // + de la barra inferior
  await page.getByLabel("Monto").fill("12.50");
  await page.getByText("Comida", { exact: true }).click();
  await page.getByLabel("Nota (opcional)").fill(`${E2E_MARK} almuerzo`);
  await page.getByRole("button", { name: "Guardar gasto" }).click();
  await expect(page.getByText(`${E2E_MARK} almuerzo`)).toBeVisible();
  const elapsed = Date.now() - start;
  console.log(`Gasto registrado y visible en el Inicio en ${elapsed} ms`);
  expect(elapsed).toBeLessThan(5000);

  // Pagado en efectivo por defecto
  await expect(page.getByText("Efectivo").first()).toBeVisible();
});

test("Me yapearon resta del gastado; un ingreso suma al neto", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  await page.getByRole("button", { name: "Gasto efectivo" }).click();
  await page.getByLabel("Monto").fill("180");
  await page.getByText("Salidas", { exact: true }).click();
  await page.getByLabel("Nota (opcional)").fill(`${E2E_MARK} cena grupal`);
  await page.getByRole("button", { name: "Guardar gasto" }).click();
  await expect(page.getByText(`${E2E_MARK} cena grupal`)).toBeVisible();

  await page.getByRole("button", { name: "Me yapearon" }).click();
  await page.getByLabel("Monto").fill("60");
  await page.getByText("Walter", { exact: true }).click();
  await page.getByLabel("Nota (opcional)").fill(`${E2E_MARK} parte de la cena`);
  await page.getByRole("button", { name: "Guardar yapeo" }).click();
  await expect(page.getByText("Me yapeó Walter")).toBeVisible();

  await page.getByRole("button", { name: "Ingreso" }).click();
  await page.getByLabel("Monto").fill("833");
  await page.getByText("Sueldo", { exact: true }).click();
  await page.getByLabel("Nota (opcional)").fill(`${E2E_MARK} 6 días de octubre`);
  await page.getByRole("button", { name: "Guardar ingreso" }).click();
  await expect(page.getByText(`${E2E_MARK} 6 días de octubre`)).toBeVisible();

  // 12.50 + 180 − 60 = 132.50 gastado; 833 − 132.50 = 700.50 neto
  await expect(page.getByText("S/ 132.50").first()).toBeVisible();
  await expect(page.getByText("S/ 700.50")).toBeVisible();
});

test("editar y anular un movimiento desde Movimientos", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/movimientos");
  await page.getByRole("button", { name: `${E2E_MARK} almuerzo` }).click();
  await expect(page.getByRole("heading", { name: "Editar movimiento" })).toBeVisible();
  await shot(page, "editar-1440");
  await page.getByRole("button", { name: "Anular" }).click();
  await expect(page.getByText("Movimiento anulado")).toBeVisible();
  await expect(page.locator("table").getByText("Anulado")).toBeVisible();
});

for (const vp of VIEWPORTS) {
  test(`capturas en ${vp.name} px`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });

    for (const [path, name, heading] of [
      ["/", "inicio", "Inicio"],
      ["/movimientos", "movimientos", "Movimientos"],
      ["/ajustes", "ajustes", "Ajustes"],
      ["/metas", "metas", "Metas y proyección"],
      ["/mas", "mas", "Más"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await shot(page, `${name}-${vp.name}`);
    }

    // Registro rápido abierto
    await page.goto("/");
    await page.getByRole("button", { name: "Registrar" }).first().click();
    await expect(page.getByLabel("Monto")).toBeVisible();
    await page.waitForTimeout(400); // animación de la hoja
    await page.screenshot({ path: `e2e/screenshots/registro-${vp.name}.png` });

    // Sin desbordes horizontales
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("tablet: la barra lateral se expande", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");
  await page.getByRole("button", { name: "Expandir menú" }).click();
  await expect(page.getByRole("button", { name: "Colapsar menú" })).toBeVisible();
  await shot(page, "inicio-768-menu-expandido");
  await page.getByRole("button", { name: "Colapsar menú" }).click();
});
