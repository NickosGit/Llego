import { defineConfig, devices } from "@playwright/test";

// Las pruebas e2e entran con una cuenta de PRUEBA generada por scripts/ (service role).
try {
  process.loadEnvFile(".env.local");
} catch {
  // En CI las variables llegan por el entorno.
}

const PORT = 3500;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    ...devices["Pixel 7"],
    // Navegador ya instalado en Windows: nada que descargar.
    channel: process.env.PW_CHANNEL ?? "msedge",
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
