import { expect, test } from "@playwright/test";

import { loginLink } from "../../scripts/login_link.ts";

test("sin sesión, /corredor manda al login (T1)", async ({ page }) => {
  await page.goto("/corredor");
  await expect(page).toHaveURL(/\/login\?next=%2Fcorredor/);
  await expect(page.getByTestId("sim-banner")).toHaveText("DATOS SIMULADOS");
});

test("camino feliz: login → corredor → tarjeta del pronóstico", async ({ page, baseURL }) => {
  await page.goto(await loginLink("a", baseURL!));
  await expect(page).toHaveURL(/\/corredor$/);

  await expect(page.getByTestId("sim-banner")).toBeVisible();
  const card = page.getByTestId("forecast-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Espera típica:");
  await expect(card).toContainText("Día malo: hasta");
  await expect(card).toContainText("Ir sentado:");
  await expect(page.getByTestId("confidence-pill")).toHaveText(/Buen dato · \d+ viajes|Poco dato · \d+ viajes|Sin dato/);
  await expect(page.getByTestId("corridor-map")).toBeVisible();
});
