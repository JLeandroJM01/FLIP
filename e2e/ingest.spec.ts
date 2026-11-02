import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { adminClient } from "./helpers";

// Correo real (anonimizado) de un consumo sin regla de comercio → "Por revisar" → categorizar.
const ID = `e2e-ingest-${Date.now()}`;
const raw = readFileSync("tests/fixtures/emails/consumo_credito.txt", "utf8");
const [first, ...rest] = raw.split("\n");

async function cleanup() {
  const db = adminClient();
  const { data } = await db.from("raw_emails").select("id").like("gmail_message_id", "e2e-ingest-%");
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length) await db.from("transactions").delete().in("raw_email_id", ids);
  await db.from("raw_emails").delete().like("gmail_message_id", "e2e-ingest-%");
  await db.from("merchant_rules").delete().eq("pattern", "AQUA HOTEL 933");
}
test.beforeAll(cleanup);
test.afterAll(cleanup);

test("un correo del BCP llega, se revisa y se crea la regla del comercio", async ({ page, request }) => {
  const body = JSON.stringify({
    sent_at: new Date().toISOString(),
    messages: [
      {
        gmail_message_id: ID,
        from: "BCP Notificaciones <notificaciones@notificacionesbcp.com.pe>",
        subject: first.replace(/^Subject: /, ""),
        date: new Date().toISOString(),
        plain_body: rest.join("\n"),
      },
    ],
  });
  const res = await request.post("/api/ingest", {
    data: body,
    headers: {
      "content-type": "application/json",
      "x-ingest-signature": createHmac("sha256", process.env.INGEST_SECRET!).update(body).digest("hex"),
    },
  });
  expect(res.status()).toBe(200);
  expect((await res.json()).processing).toMatchObject({ ok: 1 });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/movimientos?vista=por_revisar");
  await expect(page.getByText("AQUA HOTEL 933").first()).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/por-revisar-375.png", fullPage: true });

  await page.getByRole("button", { name: /AQUA HOTEL 933/ }).first().click();
  await expect(page.getByText("desde Gmail")).toBeVisible();
  const sheet = page.getByRole("dialog");
  await sheet.getByText("Salidas", { exact: true }).click();
  await sheet.getByText("Usar siempre esta categoría para").click();
  await page.screenshot({ path: "e2e/screenshots/revisar-editar-375.png" });
  await sheet.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText(/Regla creada para AQUA HOTEL 933/)).toBeVisible();

  const { data: rule } = await adminClient().from("merchant_rules").select("pattern").eq("pattern", "AQUA HOTEL 933").single();
  expect(rule?.pattern).toBe("AQUA HOTEL 933");
  await page.reload();
  await expect(page.getByText("AQUA HOTEL 933")).toHaveCount(0);
});
