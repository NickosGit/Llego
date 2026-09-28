import { expect, test, type Page } from "@playwright/test";

import { STOPS } from "../../config/corridor.ts";
import { loginLink } from "../../scripts/login_link.ts";

const A = STOPS[0];
const D = STOPS[3];
const ALLOWED = ["daytype", "got_seat", "hour", "ride_min", "stop_from", "stop_to", "wait_min"];

const confirming = new WeakSet<Page>();

async function deleteAllMyTrips(page: Page) {
  await page.goto("/mis-viajes");
  if (!confirming.has(page)) {
    confirming.add(page);
    page.on("dialog", (d) => d.accept());
  }
  while ((await page.getByTestId("my-trip").count()) > 0) {
    const before = await page.getByTestId("my-trip").count();
    await page.getByTestId("my-trip").first().getByRole("button", { name: "Borrar" }).click();
    await expect(page.getByTestId("my-trip")).toHaveCount(before - 1);
  }
}

test("T7 + T10: viaje con GPS simulado, payload sin coordenadas, y borrarlo", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: A.lat, longitude: A.lng, accuracy: 10 });

  await page.goto(await loginLink("a", baseURL!, "/viaje"));
  await deleteAllMyTrips(page);
  await page.goto("/viaje");

  // Consentimiento antes del primer uso.
  await expect(page.getByTestId("gps-consent")).toContainText(
    "Guardamos cuánto esperaste y cuánto tardaste. No guardamos tu recorrido.",
  );
  await page.getByRole("button", { name: "Acepto" }).click();
  await page.getByRole("button", { name: "Empezar" }).click();
  await expect(page.getByTestId("trip-live")).toContainText("Esperando en Atizapán");

  // Se aleja de la parada (2 lecturas) → va en camino.
  await context.setGeolocation({ latitude: A.lat - 0.002, longitude: A.lng + 0.002, accuracy: 10 });
  await page.waitForTimeout(300);
  await context.setGeolocation({ latitude: A.lat - 0.004, longitude: A.lng + 0.004, accuracy: 10 });
  await expect(page.getByTestId("trip-live")).toContainText("En camino a Metro El Rosario");

  // Llega al destino → se apaga solo y pregunta por el asiento.
  const tripRequest = page.waitForRequest((r) => r.url().includes("/rest/v1/trips") && r.method() === "POST");
  await context.setGeolocation({ latitude: D.lat, longitude: D.lng, accuracy: 10 });
  await page.getByRole("button", { name: "Sí" }).click();

  const body = JSON.parse((await tripRequest).postData() ?? "{}");
  expect(Object.keys(body).sort()).toEqual(ALLOWED);
  expect(JSON.stringify(body)).not.toMatch(/lat|lng|coord|trail/i);
  expect(body).toMatchObject({ stop_from: "A", stop_to: "D", got_seat: true });
  await expect(page.getByTestId("trip-result")).toContainText("Listo");

  // T10: aparece en Mis viajes y al borrarlo desaparece.
  await page.goto("/mis-viajes");
  await expect(page.getByTestId("my-trip")).toHaveCount(1);
  await deleteAllMyTrips(page);
  await expect(page.getByText("Todavía no registras viajes.")).toBeVisible();
});

test("GPS negado → registro manual con dos horas", async ({ page, baseURL }) => {
  await page.goto(await loginLink("b", baseURL!, "/viaje"));
  await deleteAllMyTrips(page);
  await page.goto("/viaje");
  await page.getByRole("button", { name: "Acepto" }).click();
  await page.getByRole("button", { name: "Empezar" }).click();
  // Sin permiso de ubicación en el contexto: el navegador lo niega.
  await expect(page.getByText("No diste permiso de ubicación")).toBeVisible();
  await expect(page.getByTestId("manual-trip")).toBeVisible();

  await page.getByLabel("Llegué a la parada").fill("05:10");
  await page.getByLabel("Me subí").fill("05:25");
  await expect(page.getByTestId("manual-trip")).toContainText("Esperaste 15 min.");
  await page.getByRole("button", { name: "Seguir" }).click();

  const tripRequest = page.waitForRequest((r) => r.url().includes("/rest/v1/trips") && r.method() === "POST");
  await page.getByRole("button", { name: "No" }).click();
  const body = JSON.parse((await tripRequest).postData() ?? "{}");
  expect(body).toMatchObject({ wait_min: 15, ride_min: 40, hour: 5, got_seat: false });
  await expect(page.getByTestId("trip-result")).toContainText("Listo");
  await deleteAllMyTrips(page);
});

test("T8: si la subida falla una vez, reintenta y llega", async ({ page, baseURL }) => {
  await page.goto(await loginLink("c", baseURL!, "/viaje"));
  await deleteAllMyTrips(page);
  await page.goto("/viaje");
  await page.getByRole("button", { name: "Ahora no" }).click();
  await page.getByRole("button", { name: "Seguir" }).click();

  let attempts = 0;
  await page.route("**/rest/v1/trips*", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts++;
    return attempts === 1 ? route.abort("internetdisconnected") : route.continue();
  });
  await page.getByRole("button", { name: "Sí" }).click();
  await expect(page.getByTestId("trip-result")).toContainText("Listo", { timeout: 15_000 });
  expect(attempts).toBe(2);
  await page.unroute("**/rest/v1/trips*");
  await deleteAllMyTrips(page);
});

test("T8: con Slow 3G el pronóstico se muestra", async ({ page, baseURL }) => {
  await page.goto(await loginLink("a", baseURL!, "/corredor"));
  await expect(page.getByTestId("forecast-card")).toBeVisible();

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  // Perfil "Slow 3G" de DevTools: 2 s de latencia, ~400 kbps.
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 2000,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (400 * 1024) / 8,
  });
  await page.reload();
  await expect(page.getByTestId("forecast-card")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("forecast-card")).toContainText("Espera típica:");
});
