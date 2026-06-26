'use client';

import React from 'react';

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Threshold in COP below which a card is considered "Al día" (up to date). */
export const UP_TO_DATE_THRESHOLD = 5000;

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface BalanceComparisonSectionProps {
  usedCredit: number;
  projectedTotal: number;
  totalProjectedDebt?: number;        // NEW — when provided, used for "Sin registrar"
  formatCurrency: (amount: number) => string;
  hideBalances: boolean;
}

// ─── Component ─────────────────────────────────────────────────────────────────

/**
 * Displays a comparison between the real credit card balance (usedCredit)
 * and the app-projected total, highlighting unrecorded purchases.
 *
 * When usedCredit <= UP_TO_DATE_THRESHOLD, shows "Al día" badge instead.
 *
 * Validates: Requirements 2.2, 2.3, 2.4, 2.6, 2.7, 3.1, 3.2, 3.4, 3.5
 */
export const BalanceComparisonSection: React.FC<BalanceComparisonSectionProps> = ({
  usedCredit,
  projectedTotal,
  totalProjectedDebt,
  formatCurrency,
  hideBalances,
}) => {
  // "Al día" state — early exit when balance is negligible.
  // Shown regardless of hideBalances because it's a status indicator, not a monetary value.
  if (usedCredit <= UP_TO_DATE_THRESHOLD) {
    return (
      <div
        className="flex items-center justify-center"
        data-testid="up-to-date-badge"
      >
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-sm font-medium bg-success-muted text-success">
          ✓ Al día
        </span>
      </div>
    );
  }

  const effectiveProjected = totalProjectedDebt ?? projectedTotal;
  const unrecorded = usedCredit - effectiveProjected;
  const hasUnrecorded = unrecorded > 0;
  const label = totalProjectedDebt != null ? 'Proyectado (total)' : 'Proyectado';
  const mask = '------';

  return (
    <div className="border-t border-border pt-2 space-y-1">
      {/* Saldo real */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Saldo real</span>
        <span className="text-xs font-medium text-foreground">
          {hideBalances ? mask : formatCurrency(usedCredit)}
        </span>
      </div>

      {/* Proyectado */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-medium text-foreground">
          {hideBalances ? mask : formatCurrency(effectiveProjected)}
        </span>
      </div>

      {/* Sin registrar */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Sin registrar</span>
        <span
          className={`text-xs font-medium ${
            hasUnrecorded
              ? 'text-warning'
              : 'text-foreground'
          }`}
          data-testid="unrecorded-value"
        >
          {hideBalances ? mask : formatCurrency(unrecorded)}
        </span>
      </div>
    </div>
  );
};
