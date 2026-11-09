'use client';

import React, { memo, useMemo } from 'react';
import { Wallet, Banknote, Star, Archive } from 'lucide-react';
import type { Account } from '../../../../types/finance';
import { useUIPreferences } from '@/contexts/UIPreferencesContext';
import { BalanceSettling } from '@/components/shared/BalanceSettling';
import { getCreditAuthorityState } from '../../../../utils/creditAuthority';
import { getAccountBalancePresentation } from '../utils/accountBalancePresentation';
import { AccountActionsBar, AccountReorderButtons } from './AccountActions';
import { UI_LABELS } from '@/config/constants';

/**
 * Fila LIMPIA de cuenta de ahorro/efectivo — SOLO layout MÓVIL.
 *
 * En vez de una caja con borde, usa un separador sutil, un icono redondeado con
 * el color de marca de la cuenta, nombre + tipo y el saldo tabular alineado a
 * la derecha. No recalcula saldos (recibe `balance` del dominio) y conserva
 * TODAS las acciones (barra compartida) y el reordenado por teclado.
 */

const TYPE_META = {
  savings: { icon: Wallet, label: UI_LABELS.accountTypes.savings },
  cash: { icon: Banknote, label: UI_LABELS.accountTypes.cash },
} as const;

interface AccountRowProps {
  account: Account;
  balance: number;
  balanceSettling?: boolean;
  formatCurrency: (amount: number) => string;
  onEdit: () => void;
  onManagePaymentInstruments?: () => void;
  onSetDefault: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

export const AccountRow: React.FC<AccountRowProps> = memo(({
  account,
  balance,
  balanceSettling = false,
  formatCurrency,
  onEdit,
  onManagePaymentInstruments,
  onSetDefault,
  onArchive,
  onUnarchive,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
}) => {
  const { hideBalances } = useUIPreferences();
  const creditAuthority = getCreditAuthorityState(account);

  const presentation = useMemo(
    () =>
      getAccountBalancePresentation({
        account,
        balance,
        creditUsed: 0,
        creditAuthority,
        balanceSettling,
        hideBalances,
        formatCurrency,
      }),
    [account, balance, creditAuthority, balanceSettling, hideBalances, formatCurrency]
  );

  const meta = TYPE_META[account.type as keyof typeof TYPE_META] ?? TYPE_META.savings;
  const Icon = meta.icon;

  return (
    <div data-account-id={account.id} className="py-3">
      <div className="flex items-center gap-3">
        <AccountReorderButtons
          accountName={account.name}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
        />

        {/* Icono redondeado en el violet del sistema (tinte primary/10 + icono
            --primary), igual que el icono de la cabecera de sección. Antes usaba
            el color de MARCA de la cuenta (incluía naranjas/ámbar fuera de
            paleta); el color de marca queda reservado a las dos excepciones
            móviles (gradiente de la tarjeta billetera y segmentos del anillo). */}
        <span
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <Icon size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="min-w-0 break-words text-sm font-semibold text-foreground">
              {account.name}
            </h4>
            {account.isDefault && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-solid px-2 py-0.5 text-xs font-medium text-primary-foreground">
                <Star size={10} aria-hidden="true" />
                Principal
              </span>
            )}
            {account.archived && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <Archive size={10} aria-hidden="true" />
                Archivada
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{meta.label}</p>
        </div>

        {/* Saldo tabular alineado a la derecha. */}
        <div
          className={`flex-shrink-0 text-right font-mono text-base font-bold ${presentation.toneClass}`}
          aria-label={presentation.accessibleAmountLabel}
        >
          {presentation.isSettling ? (
            <BalanceSettling className="text-sm font-medium font-sans text-muted-foreground" />
          ) : (
            presentation.formattedAmount
          )}
        </div>
      </div>

      {/* Acciones de la fila. */}
      <div className="mt-2 pl-12">
        <AccountActionsBar
          account={account}
          isCredit={false}
          authorityReady={creditAuthority.ready}
          authorityMessageId={`credit-authority-row-${account.id ?? 'unknown'}`}
          onEdit={onEdit}
          onManagePaymentInstruments={onManagePaymentInstruments}
          onSetDefault={onSetDefault}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
});

AccountRow.displayName = 'AccountRow';
