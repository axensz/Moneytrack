import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Auditoría de accesibilidad con axe-core (motor WCAG estándar, el mismo de
 * Lighthouse). Verifica OBJETIVAMENTE el principio "AA siempre" de PRODUCT.md.
 *
 * Requiere el dev server corriendo (npm run dev) en localhost:3000, o define
 * AUDIT_BASE_URL. Ejecuta: npm run audit:a11y
 *
 * Nota: la app requiere sesión; las rutas internas pueden redirigir a login si
 * no hay auth. Este test audita lo que sea accesible públicamente (login /
 * landing). Para auditar vistas autenticadas, añade aquí los pasos de login o
 * usa un storageState; déjalo como TODO hasta tener credenciales de prueba.
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.describe('Accesibilidad (WCAG AA)', () => {
  test('pantalla inicial no tiene violaciones WCAG A/AA', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();

    // Reporte legible de cada violación (id, impacto, nº de nodos).
    if (results.violations.length > 0) {
      console.log('\nViolaciones WCAG encontradas:');
      for (const v of results.violations) {
        console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodos) -> ${v.helpUrl}`);
      }
    }

    expect(results.violations, 'Debe cumplir WCAG A/AA sin violaciones').toEqual([]);
  });
});
