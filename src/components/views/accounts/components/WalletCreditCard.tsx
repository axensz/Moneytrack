'use client';

import React, { memo, useMemo } from 'react';
import { AlertTriangle, GripVertical, Star, Archive } from 'lucide-react';
import type { Account } from '../../../../types/finance';
import { getCreditAuthorityState } from '../../../../utils/creditAuthority';
import { useUIPreferences } from '@/contexts/UIPreferencesContext';
import { getAccountBrand } from '../utils/accountBrandColors';
import { AccountActionsBar, AccountReorderButtons } from './AccountActions';

/**
 * Tarjeta de crédito estilo BILLETERA — SOLO layout MÓVIL.
 *
 * Presenta cada TC como una "tarjeta física" con el gradiente del color de
 * MARCA propio de la tarjeta (`.card-wallet` + variables `--wallet-from/to`
 * inyectadas desde `accountBrandColors`). Muestra chip, últimos 4 (si el nombre
 * los incluye), nombre, deuda grande y barra de uso de cupo.
 *
 * No recalcula saldos: recibe `creditUsed` del dominio. Conserva la autoridad
 * de tarjeta (bloqueo por conciliación) y TODAS las acciones (barra compartida).
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

  const brand = useMemo(() => getAccountBrand(account.name), [account.name]);
  const last4 = useMemo(() => extractLast4(account.name), [account.name]);

  const creditLimit = account.creditLimit ?? 0;
  const usagePercentage = creditLimit > 0
    ? Math.min(100, Math.max(0, (creditUsed / creditLimit) * 100))
    : 0;

  const displayAmount = (amount: number) =>
    hideBalances ? '••••••' : formatCurrency(amount);
  const displayPercent = (percentage: number) =>
    hideBalances ? '••' : `${percentage.toFixed(0)}%`;

  const available = Math.max(0, creditLimit - creditUsed);

  return (
    <div className="space-y-3">
      <div
        data-account-id={account.id}
        className="card-wallet"
        style={{
          // Inyecta el gradiente de marca de ESTA tarjeta (texto blanco AA).
          ['--wallet-from' as string]: brand.from,
          ['--wallet-to' as string]: brand.to,
        }}
      >
        {/* Cabecera: reorden + nombre + badges. El texto va en blanco (sobre el
            gradiente oscuro de marca, AA verificado). */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <GripVertical
              size={18}
              className="flex-shrink-0 text-white/60 cursor-grab active:cursor-grabbing"
              aria-hidden="true"
            />
            <AccountReorderButtons
              accountName={account.name}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h4 className="min-w-0 break-words text-base font-semibold text-white">
                  {account.name}
                </h4>
                {account.isDefault && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/25 px-2 py-0.5 text-xs font-medium text-white">
                    <Star size={11} aria-hidden="true" />
                    Principal
                  </span>
                )}
                {account.archived && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium text-white">
                    <Archive size={11} aria-hidden="true" />
                    Archivada
                  </span>
                )}
              </div>
              {parentAccountName && (
                <p className="mt-0.5 truncate text-xs text-white/70">{parentAccountName}</p>
              )}
            </div>
          </div>

          {/* Chip + últimos 4. El chip es puramente decorativo (aria-hidden). */}
          <div className="flex flex-shrink-0 flex-col items-end gap-2">
            <span
              className="h-6 w-8 rounded-md bg-gradient-to-br from-yellow-200/90 to-yellow-400/70 ring-1 ring-white/30"
              aria-hidden="true"
            />
            {last4 && (
              <span className="font-mono text-xs tracking-widest text-white/80">
                •••• {last4}
              </span>
            )}
          </div>
        </div>

        {creditAuthority.ready ? (
          <>
            {/* Deuda grande: la cifra ancla de la tarjeta. */}
            <div className="mt-5">
              <p className="text-xs font-medium uppercase tracking-wide text-white/70">
                Deuda actual
              </p>
              <p className="mt-0.5 font-mono text-3xl font-bold text-white">
                {displayAmount(creditUsed)}
              </p>
            </div>

            {/* Barra de uso de cupo sobre el gradiente (pista translúcida). */}
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-xs text-white/80">
                <span>Uso del cupo</span>
                <span className="font-mono font-semibold text-white">
                  {displayPercent(usagePercentage)}
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-white/25"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-500 motion-reduce:transition-none"
                  style={{ width: hideBalances ? '0%' : `${usagePercentage}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-white/80">
                <span>
                  Cupo{' '}
                  <span className="font-mono font-medium text-white">
                    {displayAmount(creditLimit)}
                  </span>
                </span>
                <span>
                  Disponible{' '}
                  <span className="font-mono font-medium text-white">
                    {displayAmount(available)}
                  </span>
                </span>
              </div>
            </div>

            {/* Fechas de corte/pago, discretas sobre la tarjeta. */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/75">
              <span>
                Corte:{' '}
                <span className="font-medium text-white">
                  {nextCutoff ? nextCutoff.toLocaleDateString('es-CO') : 'Sin definir'}
                </span>
              </span>
              <span>
                Pago:{' '}
                <span className="font-medium text-white">
                  {nextPayment ? nextPayment.toLocaleDateString('es-CO') : 'Sin definir'}
                </span>
              </span>
            </div>
          </>
        ) : (
          // Autoridad no lista: misma semántica que la card de escritorio, pero
          // adaptada al fondo oscuro de la tarjeta billetera.
          <div
            id={authorityMessageId}
            role="status"
            className="mt-5 flex items-start gap-2 rounded-lg bg-white/15 p-3 text-sm text-white"
          >
            <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Requiere conciliación</p>
              <p className="mt-0.5 text-xs text-white/80">
                La deuda persistida no es válida. MoneyTrack bloqueó unificación y
                eliminación hasta conciliarla.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Acciones fuera de la tarjeta billetera: viven sobre la superficie
          normal para conservar el contraste AA de sus textos/iconos. */}
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
  );
});

WalletCreditCard.displayName = 'WalletCreditCard';
