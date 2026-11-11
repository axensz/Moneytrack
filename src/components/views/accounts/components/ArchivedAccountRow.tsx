'use client';

import React, { memo } from 'react';
import type { Account } from '../../../../types/finance';
import { useUIPreferences } from '@/contexts/UIPreferencesContext';
import { getCreditAuthorityState } from '../../../../utils/creditAuthority';
import { UI_LABELS } from '@/config/constants';
import { AccountActionsMenu } from './AccountActions';

/**
 * Fila RESUMIDA de cuenta archivada.
 *
 * Solo lo esencial: nombre, tipo e importe (saldo, o deuda si es crédito) y un
 * menú "⋯" con Desarchivar y Eliminar. Sin barra de uso, fechas ni botones
 * sueltos: las archivadas no son el foco de la pantalla. `amount` llega ya
 * calculado por el dominio; aquí no se recalcula nada.
 */

interface ArchivedAccountRowProps {
  account: Account;
  /** Saldo (ahorro/efectivo) o deuda actual (crédito), ya calculado. */
  amount: number;
  formatCurrency: (amount: number) => string;
  onUnarchive: () => void;
  onDelete: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  savings: UI_LABELS.accountTypes.savings,
  cash: UI_LABELS.accountTypes.cash,
  credit: UI_LABELS.accountTypes.credit,
};

export const ArchivedAccountRow: React.FC<ArchivedAccountRowProps> = memo(({
  account,
  amount,
  formatCurrency,
  onUnarchive,
  onDelete,
}) => {
  const { hideBalances } = useUIPreferences();
  const isCredit = account.type === 'credit';
  const creditAuthority = getCreditAuthorityState(account);
  const typeLabel = TYPE_LABELS[account.type] ?? account.type;

  return (
    <li data-account-id={account.id} className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{account.name}</p>
        <p className="text-xs text-muted-foreground">{typeLabel}</p>
      </div>
      <span className="flex-shrink-0 font-mono text-sm text-muted-foreground">
        {hideBalances ? '••••••' : formatCurrency(amount)}
      </span>
      <AccountActionsMenu
        account={account}
        isCredit={isCredit}
        authorityReady={creditAuthority.ready}
        authorityMessageId={`credit-authority-archived-${account.id ?? 'unknown'}`}
        onSetDefault={() => {}}
        onUnarchive={onUnarchive}
        onDelete={onDelete}
      />
    </li>
  );
});

ArchivedAccountRow.displayName = 'ArchivedAccountRow';
