import { defineConfig, devices } from '@playwright/test';

/**
 * Configuración de Playwright para auditoría de UI/UX (NO reemplaza Vitest).
 *
 * - Los tests unitarios siguen en src/__tests__ con Vitest (*.test.ts).
 * - Los tests de navegador (accesibilidad con axe, screenshots / visual
 *   regression) viven en e2e/ como *.spec.ts, así los dos runners no se pisan.
 * - Apunta al dev server de Next en localhost:3000. Levántalo aparte con
 *   `npm run dev` antes de correr la auditoría (no lo arranca este config para
 *   no bloquear; si prefieres que lo levante solo, descomenta webServer abajo).
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/report' }]],
  use: {
    baseURL: process.env.AUDIT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Para que Playwright levante el dev server solo, descomenta:
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: true,
  //   timeout: 120_000,
  // },
});
