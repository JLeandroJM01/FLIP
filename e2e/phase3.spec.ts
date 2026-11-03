import { expect, test } from "@playwright/test";
import { VIEWPORTS } from "../playwright.config";
import { cleanupE2EData, E2E_MARK } from "./helpers";

test.describe.configure({ mode: "serial" });
test.beforeAll(cleanupE2EData);
test.afterAll(cleanupE2EData);

test("gasto compartido: pregunta, división en partes iguales, Te deben y Me yapearon (SPEC 8)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  // 1. Una cena de S/ 180 en Salidas (≥ S/ 60) → aparece "¿Fue compartido?"
  await page.getByRole("button", { name: "Gasto efectivo" }).click();
  await page.getByLabel("Monto").fill("180");
  await page.getByRole("dialog").getByText("Salidas", { exact: true }).click();
  await page.getByLabel("Nota (opcional)").fill(`${E2E_MARK} cena compartida`);
  await page.getByRole("button", { name: "Guardar gasto" }).click();
  await expect(page.getByText(/¿Fue compartido\?/)).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/compartido-pregunta-375.png" });

  // 2. Sí → con Daniela y Walter, partes iguales → mi parte S/ 60
  await page.getByRole("button", { name: "Sí", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Daniela" }).click();
  await sheet.getByRole("button", { name: "Walter" }).click();
  await expect(sheet.getByText("Tu parte", { exact: true })).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/compartido-form-375.png" });
  await sheet.getByRole("button", { name: "Guardar gasto compartido" }).click();
  await expect(page.getByText("Compartido: tu parte es S/ 60.00")).toBeVisible();

  // 3. Te deben S/ 120 y el gasto del mes cuenta solo mi parte
  const owed = page.locator("[data-slot=card]", { hasText: "Te deben" });
  await expect(owed.getByText("S/ 120.00").first()).toBeVisible();
  await expect(page.getByText(/¿Fue compartido\?/)).toHaveCount(0);

  // 4. Walter me yapea S/ 60 → se liga a la cena → Te deben S/ 60
  await owed.getByRole("button", { name: /Walter/ }).click();
  await expect(page.getByText("¿De qué gasto compartido?")).toBeVisible();
  await page.getByLabel("Monto").fill("60");
  await page.getByLabel("Nota (opcional)").fill(`${E2E_MARK} yapeo walter`);
  await page.getByRole("button", { name: "Guardar yapeo" }).click();
  await expect(owed.getByText("S/ 60.00").first()).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/inicio-fase3-375.png", fullPage: true });
});

for (const vp of VIEWPORTS) {
  test(`capturas Fase 3 en ${vp.name} px`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const [path, name, heading] of [
      ["/tarjeta", "tarjeta", "Tarjeta"],
      ["/deudas", "deudas", "Deudas"],
      ["/ingresos", "ingresos", "Ingresos"],
      ["/metas", "metas", "Metas y proyección"],
      ["/", "inicio-fase3", "Inicio"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await page.waitForTimeout(300); // gráfico
      await page.screenshot({ path: `e2e/screenshots/${name}-${vp.name}.png`, fullPage: true });
      // Elementos que se salen del ancho (sin contar los que están dentro de un contenedor con scroll).
      const wide = await page.evaluate(() => {
        const scrolls = (el: Element | null): boolean =>
          !!el && el !== document.body && (/(auto|scroll)/.test(getComputedStyle(el).overflowX) || scrolls(el.parentElement));
        return [...document.querySelectorAll("main *")]
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5 && !scrolls(el.parentElement))
          .slice(-3)
          .map((el) => `${el.tagName} «${(el.textContent ?? "").slice(0, 50)}»`);
      });
      expect(wide, `${path} se desborda en ${vp.name}px`).toEqual([]);
    }
  });
}

test("simulador: gastar más al mes retrasa la meta", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/metas");
  const goal = page.locator("[data-slot=card]", { hasText: "Llegas a la meta en" }).locator("[data-slot=card-title]");
  const before = await goal.textContent();
  await page.getByLabel("¿Y si gasto al mes…?").fill("3000");
  await expect(goal).not.toHaveText(before!);
});

test("Inicio: barras por categoría y gasto por mes de la categoría elegida", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const bars = page.locator("[data-slot=card]", { hasText: "Gasto por categoría" });
  const trend = page.locator("[data-slot=card]", { hasText: "por mes" });
  await expect(bars.getByText("Salidas").first()).toBeVisible();
  await expect(trend.getByText("Gasto en total por mes")).toBeVisible();
  // Elegir la categoría desde el selector del histograma
  await trend.getByRole("combobox", { name: "Categoría" }).selectOption({ label: "Salidas" });
  await expect(trend.getByText("Gasto en Salidas por mes")).toBeVisible();
  await bars.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "e2e/screenshots/inicio-graficos-375.png", fullPage: true });
});

test("Inicio: barras por categoría en computadora", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const bars = page.locator("[data-slot=card]", { hasText: "Gasto por categoría" });
  await expect(bars.getByText("Salidas").first()).toBeVisible();
  // Tocar la barra muestra la evolución de esa categoría en el histograma
  await bars.locator(".recharts-bar-rectangle path, .recharts-bar-rectangle").first().click();
  await expect(page.getByText("Gasto en Salidas por mes")).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/inicio-graficos-1440.png", fullPage: true });
});

test("'Volver a leer correos' está siempre visible en Por revisar (aunque no haya nada)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/movimientos?vista=por_revisar");
  const button = page.getByRole("button", { name: "Volver a leer correos" });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByText(/^Procesados \d+/)).toBeVisible();
});
