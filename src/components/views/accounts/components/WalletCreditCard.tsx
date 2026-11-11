'use client';

import React, { memo, useMemo } from 'react';
import { AlertTriangle, CreditCard, Star, Archive } from 'lucide-react';
import type { Account } from '../../../../types/finance';
import { getCreditAuthorityState } from '../../../../utils/creditAuthority';
import { useUIPreferences } from '@/contexts/UIPreferencesContext';
import {
  getAccountBalancePresentation,
  PROGRESS_BAR_TONE_CLASSES,
} from '../utils/accountBalancePresentation';
import { AccountActionsBar, AccountReorderButtons } from './AccountActions';

/**
 * Fila de tarjeta de crédito — SOLO layout MÓVIL.
 *
 * Usa el mismo lenguaje visual que `AccountRow` (cuentas de ahorro/efectivo):
 * separador sutil en vez de caja, icono redondeado en el violet del sistema,
 * nombre + tipo, importe tabular a la derecha y la barra de acciones debajo.
 * Lo propio del crédito va indentado bajo el nombre: deuda a la derecha (en
 * rojo, igual que "Deuda total"), barra de uso de cupo, cupo/disponible y
 * fechas de corte y pago.
 *
 * No recalcula saldos: recibe `creditUsed` del dominio. Conserva la autoridad
 * de tarjeta (bloqueo por conciliación) y TODAS las acciones (barra compartida).
 * El componente conserva el nombre `WalletCreditCard` para no tocar a sus
 * consumidores; ya no es una "tarjeta billetera" con gradiente.
 */

interface WalletCreditCardProps {
  account: Account;
  creditUsed: number;
  nextCutoff: Date | null;
  nextPayment: Date | null;
  parentAccountName?: string;
  formatCurrency: (amount: number) => string;
  onEdit: () => void;
  onManagePaymentInstruments?: () => void;
  onMerge?: () => void;
  onSetDefault: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

/** Extrae los últimos 4 dígitos del nombre si existen (p. ej. "Nu •• 1234"). */
function extractLast4(name: string): string | null {
  const match = name.match(/(\d{4})\D*$/);
  return match ? match[1] : null;
}

export const WalletCreditCard: React.FC<WalletCreditCardProps> = memo(({
  account,
  creditUsed,
  nextCutoff,
  nextPayment,
  parentAccountName,
  formatCurrency,
  onEdit,
  onManagePaymentInstruments,
  onMerge,
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
  const authorityMessageId = `credit-authority-wallet-${account.id ?? 'unknown'}`;

  const last4 = useMemo(() => extractLast4(account.name), [account.name]);

  const creditLimit = account.creditLimit ?? 0;
  const available = Math.max(0, creditLimit - creditUsed);

  // Misma derivación de porcentaje, tono de barra y formato que usa el resto de
  // la vista; aquí solo se reutiliza, no se recalcula la deuda.
  const presentation = useMemo(
    () =>
      getAccountBalancePresentation({
        account,
        balance: available,
        creditUsed,
        creditAuthority,
        balanceSettling: false,
        hideBalances,
        formatCurrency,
      }),
    [account, available, creditUsed, creditAuthority, hideBalances, formatCurrency]
  );
  const credit = presentation.credit;

  const displayAmount = (amount: number) =>
    hideBalances ? '••••••' : formatCurrency(amount);
  const usagePercentage = credit?.usagePercentage ?? 0;
  const usageLabel = hideBalances ? '••' : `${usagePercentage.toFixed(0)}%`;
  const barToneClass = PROGRESS_BAR_TONE_CLASSES[credit?.progressBarTone ?? 'primary'];

  const subtitle = parentAccountName
    ?? (last4 ? `Tarjeta de crédito •••• ${last4}` : 'Tarjeta de crédito');

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

        {/* Icono redondeado en el violet del sistema, igual que AccountRow. */}
        <span
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <CreditCard size={18} />
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
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>

        {/* Deuda actual a la derecha, tabular y en rojo como "Deuda total". Si
            la autoridad no está lista no se muestra una cifra no confiable. */}
        <div className="flex-shrink-0 text-right">
          {creditAuthority.ready ? (
            <>
              <p className="text-xs text-muted-foreground">Deuda</p>
              <p className="font-mono text-base font-bold text-destructive">
                {displayAmount(creditUsed)}
              </p>
            </>
          ) : (
            <p className="text-sm font-semibold text-warning">Por conciliar</p>
          )}
        </div>
      </div>

      {creditAuthority.ready ? (
        <div className="mt-2 space-y-2 pl-12">
          {/* Barra de uso del cupo. */}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Uso del cupo</span>
              <span className="font-mono font-semibold text-foreground">{usageLabel}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${barToneClass}`}
                style={{ width: credit?.progressBarWidth ?? '0%' }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="whitespace-nowrap">
              Cupo{' '}
              <span className="font-mono font-medium text-foreground">
                {displayAmount(creditLimit)}
              </span>
            </span>
            <span className="whitespace-nowrap">
              Disponible{' '}
              <span className="font-mono font-medium text-foreground">
                {displayAmount(available)}
              </span>
            </span>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Corte:{' '}
              <span className="font-medium text-foreground">
                {nextCutoff ? nextCutoff.toLocaleDateString('es-CO') : 'Sin definir'}
              </span>
            </span>
            <span>
              Pago:{' '}
              <span className="font-medium text-foreground">
                {nextPayment ? nextPayment.toLocaleDateString('es-CO') : 'Sin definir'}
              </span>
            </span>
          </div>
        </div>
      ) : (
        // Autoridad no lista: misma semántica que la card de escritorio.
        <div
          id={authorityMessageId}
          role="status"
          className="ml-12 mt-2 flex items-start gap-2 rounded-lg bg-warning-muted p-3 text-sm text-warning"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Requiere conciliación</p>
            <p className="mt-0.5 text-xs">
              La deuda persistida no es válida. MoneyTrack bloqueó unificación y
              eliminación hasta conciliarla.
            </p>
          </div>
        </div>
      )}

      {/* Acciones de la fila (misma barra y misma sangría que AccountRow). */}
      <div className="mt-2 pl-12">
        <AccountActionsBar
          account={account}
          isCredit
          authorityReady={creditAuthority.ready}
          authorityMessageId={authorityMessageId}
          onEdit={onEdit}
          onManagePaymentInstruments={onManagePaymentInstruments}
          onMerge={onMerge}
          onSetDefault={onSetDefault}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
});

WalletCreditCard.displayName = 'WalletCreditCard';
