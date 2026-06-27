/**
 * Property-based tests for BalanceComparisonSection component.
 * Feature: card-payment-window-fix, Property 4: Balance comparison styling reflects unrecorded amount sign
 * Feature: card-payment-window-fix, Property 5: Balance comparison masking under hideBalances
 * Feature: card-payment-window-fix, Property 6: Balance comparison values correctness
 *
 * **Validates: Requirements 2.2, 2.3, 2.4, 2.6, 2.7**
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import { BalanceComparisonSection, UP_TO_DATE_THRESHOLD } from './BalanceComparisonSection';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const formatCurrency = (n: number) =>
  n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

// ─── Property 4: Balance comparison styling reflects unrecorded amount sign ────

describe('Feature: card-payment-window-fix, Property 4: Balance comparison styling reflects unrecorded amount sign', () => {
  /**
   * **Validates: Requirements 2.3, 2.4**
   *
   * For any account with `usedCredit` defined and a `projectedTotal` value,
   * the "Sin registrar" display SHALL use warning style (amber) when
   * `usedCredit - projectedTotal > 0`, and neutral style when
   * `usedCredit - projectedTotal <= 0`.
   */

  it('applies amber styling when usedCredit - projectedTotal > 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (usedCredit, projectedTotal) => {
          // Only test the case where unrecorded > 0 AND above "Al día" threshold
          fc.pre(usedCredit > UP_TO_DATE_THRESHOLD);
          fc.pre(usedCredit - projectedTotal > 0);

          cleanup();
          const { getByTestId } = render(
            <BalanceComparisonSection
              usedCredit={usedCredit}
              projectedTotal={projectedTotal}
              formatCurrency={formatCurrency}
              hideBalances={false}
            />,
          );

          const unrecordedEl = getByTestId('unrecorded-value');

          // Should have amber/warning styling
          expect(unrecordedEl.className).toContain('text-warning');
          // Should NOT have neutral styling
          expect(unrecordedEl.className).not.toContain('text-foreground');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('applies neutral styling when usedCredit - projectedTotal <= 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (usedCredit, projectedTotal) => {
          // Only test the case where unrecorded <= 0 AND above "Al día" threshold
          fc.pre(usedCredit > UP_TO_DATE_THRESHOLD);
          fc.pre(usedCredit - projectedTotal <= 0);

          cleanup();
          const { getByTestId } = render(
            <BalanceComparisonSection
              usedCredit={usedCredit}
              projectedTotal={projectedTotal}
              formatCurrency={formatCurrency}
              hideBalances={false}
            />,
          );

          const unrecordedEl = getByTestId('unrecorded-value');

          // Should have neutral styling
          expect(unrecordedEl.className).toContain('text-foreground');
          // Should NOT have amber/warning styling
          expect(unrecordedEl.className).not.toContain('text-warning');
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ─── Property 5: Balance comparison masking under hideBalances ──────────────────

describe('Feature: card-payment-window-fix, Property 5: Balance comparison masking under hideBalances', () => {
  /**
   * **Validates: Requirements 2.7**
   *
   * For any rendered balance comparison section with `hideBalances === true`,
   * all monetary values ("Saldo real", "Proyectado", "Sin registrar") SHALL
   * render the mask "------" instead of formatted currency values, regardless
   * of the underlying numeric values.
   */

  it('all monetary values render "------" when hideBalances is true, regardless of numeric values', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (usedCredit, projectedTotal) => {
          // Only test the 3-row layout (above "Al día" threshold)
          fc.pre(usedCredit > UP_TO_DATE_THRESHOLD);

          cleanup();
          const { container } = render(
            <BalanceComparisonSection
              usedCredit={usedCredit}
              projectedTotal={projectedTotal}
              formatCurrency={formatCurrency}
              hideBalances={true}
            />,
          );

          // All three value spans (last child in each row) should show "------"
          const rows = container.querySelectorAll('.flex.items-center.justify-between');
          expect(rows.length).toBe(3);

          for (const row of rows) {
            const valueSpan = row.querySelector('span:last-child');
            expect(valueSpan?.textContent).toBe('------');
          }

          // No formatted currency value should be visible in the rendered output
          const formattedUsedCredit = formatCurrency(usedCredit);
          const formattedProjected = formatCurrency(projectedTotal);
          const formattedUnrecorded = formatCurrency(usedCredit - projectedTotal);

          const allText = container.textContent ?? '';
          if (formattedUsedCredit !== '------') {
            expect(allText).not.toContain(formattedUsedCredit);
          }
          if (formattedProjected !== '------') {
            expect(allText).not.toContain(formattedProjected);
          }
          if (formattedUnrecorded !== '------') {
            expect(allText).not.toContain(formattedUnrecorded);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ─── Property 6: Balance comparison values correctness ─────────────────────────

describe('Feature: card-payment-window-fix, Property 6: Balance comparison values correctness', () => {
  /**
   * **Validates: Requirements 2.2, 2.6**
   *
   * For any account with `usedCredit` defined (numeric >= 0) and a `projectedTotal`
   * value, the balance comparison section SHALL display exactly three values:
   * `usedCredit` as "Saldo real", `projectedTotal` as "Proyectado", and
   * `usedCredit - projectedTotal` as "Sin registrar", all formatted with `formatCurrency`.
   */

  it('displays correct formatted values for Saldo real, Proyectado, and Sin registrar', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (usedCredit, projectedTotal) => {
          // Only test the 3-row layout (above "Al día" threshold)
          fc.pre(usedCredit > UP_TO_DATE_THRESHOLD);

          cleanup();
          const { container } = render(
            <BalanceComparisonSection
              usedCredit={usedCredit}
              projectedTotal={projectedTotal}
              formatCurrency={formatCurrency}
              hideBalances={false}
            />,
          );

          // Get all rows (flex justify-between divs)
          const rows = container.querySelectorAll('.flex.items-center.justify-between');
          expect(rows.length).toBe(3);

          // Row 0: "Saldo real" → formatCurrency(usedCredit)
          const row0Label = rows[0].querySelector('span:first-child');
          const row0Value = rows[0].querySelector('span:last-child');
          expect(row0Label?.textContent).toBe('Saldo real');
          expect(row0Value?.textContent).toBe(formatCurrency(usedCredit));

          // Row 1: "Proyectado" → formatCurrency(projectedTotal)
          const row1Label = rows[1].querySelector('span:first-child');
          const row1Value = rows[1].querySelector('span:last-child');
          expect(row1Label?.textContent).toBe('Proyectado');
          expect(row1Value?.textContent).toBe(formatCurrency(projectedTotal));

          // Row 2: "Sin registrar" → formatCurrency(usedCredit - projectedTotal)
          const row2Label = rows[2].querySelector('span:first-child');
          const row2Value = rows[2].querySelector('span:last-child');
          expect(row2Label?.textContent).toBe('Sin registrar');
          expect(row2Value?.textContent).toBe(formatCurrency(usedCredit - projectedTotal));
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ─── Property 9: Fallback to projectedTotal when totalProjectedDebt undefined ──

describe('Feature: balance-comparison-total-debt, Property 9: Fallback to projectedTotal when totalProjectedDebt undefined', () => {
  /**
   * **Validates: Requirements 2.4**
   *
   * For any rendering where `totalProjectedDebt` is `undefined`, the component
   * SHALL compute "Sin registrar" as `usedCredit - projectedTotal` (existing
   * behavior preserved) and display the label "Proyectado" (not "Proyectado (total)").
   */

  it('"Sin registrar" equals usedCredit - projectedTotal when totalProjectedDebt is undefined', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (usedCredit, projectedTotal) => {
          // Only test the 3-row layout (above "Al día" threshold)
          fc.pre(usedCredit > UP_TO_DATE_THRESHOLD);

          cleanup();
          const { container } = render(
            <BalanceComparisonSection
              usedCredit={usedCredit}
              projectedTotal={projectedTotal}
              // totalProjectedDebt is intentionally NOT passed (undefined)
              formatCurrency={formatCurrency}
              hideBalances={false}
            />,
          );

          // Get all rows
          const rows = container.querySelectorAll('.flex.items-center.justify-between');
          expect(rows.length).toBe(3);

          // Row 1: Label should be "Proyectado" (NOT "Proyectado (total)")
          const row1Label = rows[1].querySelector('span:first-child');
          expect(row1Label?.textContent).toBe('Proyectado');

          // Row 2: "Sin registrar" value should be formatCurrency(usedCredit - projectedTotal)
          const row2Value = rows[2].querySelector('span:last-child');
          expect(row2Value?.textContent).toBe(formatCurrency(usedCredit - projectedTotal));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('label is "Proyectado" and never "Proyectado (total)" when totalProjectedDebt is undefined', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (usedCredit, projectedTotal) => {
          // Only test the 3-row layout (above "Al día" threshold)
          fc.pre(usedCredit > UP_TO_DATE_THRESHOLD);

          cleanup();
          const { container } = render(
            <BalanceComparisonSection
              usedCredit={usedCredit}
              projectedTotal={projectedTotal}
              // totalProjectedDebt is intentionally NOT passed (undefined)
              formatCurrency={formatCurrency}
              hideBalances={false}
            />,
          );

          const allText = container.textContent ?? '';

          // Should contain "Proyectado" label
          expect(allText).toContain('Proyectado');

          // Should NOT contain "Proyectado (total)" label
          expect(allText).not.toContain('Proyectado (total)');
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ─── Property 8: "Al día" threshold behavior ───────────────────────────────────

describe('Feature: balance-comparison-total-debt, Property 8: "Al día" threshold behavior', () => {
  /**
   * **Validates: Requirements 3.1, 3.3**
   *
   * For any `usedCredit <= UP_TO_DATE_THRESHOLD` (5000), the component SHALL render
   * the "Al día" badge. For any `usedCredit > UP_TO_DATE_THRESHOLD`, the component
   * SHALL render the three-row comparison (no badge).
   */

  it('renders "Al día" badge when usedCredit <= UP_TO_DATE_THRESHOLD', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (usedCredit, projectedTotal) => {
          fc.pre(usedCredit <= UP_TO_DATE_THRESHOLD);

          cleanup();
          const { getByTestId, queryByTestId } = render(
            <BalanceComparisonSection
              usedCredit={usedCredit}
              projectedTotal={projectedTotal}
              formatCurrency={formatCurrency}
              hideBalances={false}
            />,
          );

          // "Al día" badge must be present
          const badge = getByTestId('up-to-date-badge');
          expect(badge).toBeTruthy();
          expect(badge.textContent).toContain('Al día');

          // Three-row comparison must NOT be present
          expect(queryByTestId('unrecorded-value')).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('renders three-row comparison (no badge) when usedCredit > UP_TO_DATE_THRESHOLD', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (usedCredit, projectedTotal) => {
          fc.pre(usedCredit > UP_TO_DATE_THRESHOLD);

          cleanup();
          const { getByTestId, queryByTestId } = render(
            <BalanceComparisonSection
              usedCredit={usedCredit}
              projectedTotal={projectedTotal}
              formatCurrency={formatCurrency}
              hideBalances={false}
            />,
          );

          // Three-row comparison must be present (unrecorded-value exists)
          const unrecordedEl = getByTestId('unrecorded-value');
          expect(unrecordedEl).toBeTruthy();

          // "Al día" badge must NOT be present
          expect(queryByTestId('up-to-date-badge')).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('"Al día" badge text contains "Al día" for all valid values below threshold', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: UP_TO_DATE_THRESHOLD }),
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.boolean(),
        (usedCredit, projectedTotal, hideBalances) => {
          cleanup();
          const { getByTestId } = render(
            <BalanceComparisonSection
              usedCredit={usedCredit}
              projectedTotal={projectedTotal}
              formatCurrency={formatCurrency}
              hideBalances={hideBalances}
            />,
          );

          const badge = getByTestId('up-to-date-badge');
          expect(badge.textContent).toContain('Al día');
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ─── Property: Balance comparison with totalProjectedDebt provided ─────────────

describe('Feature: balance-comparison-total-debt, Property: totalProjectedDebt overrides projectedTotal', () => {
  /**
   * **Validates: Requirements 2.2, 2.3**
   *
   * For any rendering where `totalProjectedDebt` is provided:
   * - "Sin registrar" SHALL equal `usedCredit - totalProjectedDebt` (NOT usedCredit - projectedTotal)
   * - The label SHALL display "Proyectado (total)" instead of "Proyectado"
   * - The "Proyectado (total)" value SHALL display `formatCurrency(totalProjectedDebt)`
   */

  it('uses totalProjectedDebt for "Sin registrar" and shows "Proyectado (total)" label', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (usedCredit, projectedTotal, totalProjectedDebt) => {
          // Only test the 3-row layout (above "Al día" threshold)
          fc.pre(usedCredit > UP_TO_DATE_THRESHOLD);

          cleanup();
          const { container } = render(
            <BalanceComparisonSection
              usedCredit={usedCredit}
              projectedTotal={projectedTotal}
              totalProjectedDebt={totalProjectedDebt}
              formatCurrency={formatCurrency}
              hideBalances={false}
            />,
          );

          // Get all rows
          const rows = container.querySelectorAll('.flex.items-center.justify-between');
          expect(rows.length).toBe(3);

          // Row 1: Label must be "Proyectado (total)" when totalProjectedDebt is provided
          const row1Label = rows[1].querySelector('span:first-child');
          const row1Value = rows[1].querySelector('span:last-child');
          expect(row1Label?.textContent).toBe('Proyectado (total)');
          expect(row1Value?.textContent).toBe(formatCurrency(totalProjectedDebt));

          // Row 2: "Sin registrar" must be usedCredit - totalProjectedDebt
          const row2Label = rows[2].querySelector('span:first-child');
          const row2Value = rows[2].querySelector('span:last-child');
          expect(row2Label?.textContent).toBe('Sin registrar');
          expect(row2Value?.textContent).toBe(formatCurrency(usedCredit - totalProjectedDebt));

          // When projectedTotal differs from totalProjectedDebt, verify it does NOT use projectedTotal
          if (projectedTotal !== totalProjectedDebt) {
            const wrongUnrecorded = formatCurrency(usedCredit - projectedTotal);
            const actualUnrecorded = row2Value?.textContent;
            // If the wrong value differs from the correct one, it must NOT match
            if (wrongUnrecorded !== formatCurrency(usedCredit - totalProjectedDebt)) {
              expect(actualUnrecorded).not.toBe(wrongUnrecorded);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
