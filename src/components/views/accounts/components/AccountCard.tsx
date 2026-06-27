'use client';

import React, { memo } from 'react';
import { Edit2, Trash2, GripVertical, ChevronUp, ChevronDown, Wallet, CreditCard, Banknote, Combine } from 'lucide-react';
import type { Account } from '../../../../types/finance';
import { useUIPreferences } from '@/contexts/UIPreferencesContext';
import { BalanceSettling } from '@/components/shared/BalanceSettling';

const ACCOUNT_TYPES = [
  { value: 'savings' as const, label: 'Cuenta de Ahorros', icon: Wallet },
  { value: 'credit' as const, label: 'Crédito', icon: CreditCard },
  { value: 'cash' as const, label: 'Efectivo', icon: Banknote },
];

interface AccountCardProps {
  account: Account;
  balance: number;
  /**
   * true mientras el saldo aún se deriva de la ventana paginada (fetch del
   * historial completo en vuelo): muestra "Calculando…" en vez de un número
   * transitorio incorrecto. No aplica a TC (usan usedCredit persistido).
   */
  balanceSettling?: boolean;
  creditUsed: number;
  nextCutoff: Date | null;
  nextPayment: Date | null;
  parentAccountName?: string;
  isAssociated?: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  touchTransform?: string;
  formatCurrency: (amount: number) => string;
  onEdit: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
  onMerge?: () => void;
  /** Alternativa de teclado a drag & drop (WCAG 2.1.1). Opcional para no romper otros usos. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
}

/**
 * Card individual de cuenta (soporta savings, credit, cash)
 * Incluye drag & drop para reordenar
 */
export const AccountCard: React.FC<AccountCardProps> = memo(({
  account,
  balance,
  balanceSettling = false,
  creditUsed,
  nextCutoff,
  nextPayment,
  parentAccountName,
  isAssociated = false,
  isDragging,
  isDragOver,
  touchTransform,
  formatCurrency,
  onEdit,
  onSetDefault,
  onDelete,
  onMerge,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}) => {
  const { hideBalances } = useUIPreferences();
  const isCredit = account.type === 'credit';
  const accountTypeInfo = ACCOUNT_TYPES.find((t) => t.value === account.type);

  const displayAmount = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);

  const getCardClasses = () => {
    const base = 'rounded-xl p-5 transition-[box-shadow,border-color,transform,opacity,background-color] touch-none select-none relative overflow-hidden';

    if (isDragging) {
      return `${base} opacity-50 scale-95 shadow-2xl`;
    }

    if (isDragOver) {
      return `${base} border-2 border-primary shadow-lg scale-102 bg-primary/5`;
    }

    if (isAssociated) {
      return `${base} border border-border bg-primary/5 hover:border-border-accent hover:shadow-md ${account.isDefault ? 'ring-2 ring-primary' : ''
        }`;
    }

    if (account.isDefault) {
      return `${base} border-2 border-primary bg-primary/5 shadow-md`;
    }

    return `${base} border border-border bg-card hover:border-border-accent hover:shadow-md`;
  };

  return (
    <div
      data-account-id={account.id}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={getCardClasses()}
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        transform: touchTransform,
        zIndex: isDragging ? 50 : undefined,
      }}
    >
      <div>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <GripVertical
                size={isAssociated ? 16 : 20}
                className="text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0"
                aria-hidden="true"
              />
              {(onMoveUp || onMoveDown) && (
                <div className="flex flex-col flex-shrink-0" role="group" aria-label={`Reordenar ${account.name}`}>
                  <button
                    type="button"
                    onClick={onMoveUp}
                    disabled={!canMoveUp}
                    aria-label={`Mover ${account.name} hacia arriba`}
                    className="flex items-center justify-center h-5 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <ChevronUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={onMoveDown}
                    disabled={!canMoveDown}
                    aria-label={`Mover ${account.name} hacia abajo`}
                    className="flex items-center justify-center h-5 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                </div>
              )}
              <div className="p-1.5 rounded-lg flex-shrink-0 bg-primary/10">
                {accountTypeInfo &&
                  React.createElement(accountTypeInfo.icon, {
                    size: isAssociated ? 16 : 18,
                    className: 'text-primary',
                  })}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4
                  className={`font-semibold text-foreground ${isAssociated ? 'text-sm sm:text-base' : ''
                    }`}
                >
                  {account.name}
                </h4>
                {account.isDefault && (
                  <span className="text-xs text-primary-foreground px-2 py-0.5 rounded-full font-medium bg-primary-solid">
                    Principal
                  </span>
                )}
              </div>
            </div>

            {/* Type badge */}
            <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary">
              {accountTypeInfo?.label}
            </span>
            {parentAccountName && (
              <span className="ml-2 text-xs text-primary">
                • {parentAccountName}
              </span>
            )}
          </div>

          {/* Balance */}
          <div className="text-left sm:text-right">
            <div
              className={`text-xl sm:text-2xl font-bold ${balance < 0 ? 'text-destructive' : 'text-success'
                }`}
            >
              {isCredit && (
                <div className="text-xs font-normal text-muted-foreground mb-1">
                  Disponible
                </div>
              )}
              {!isCredit && balanceSettling ? (
                <BalanceSettling className="text-base font-medium text-muted-foreground" />
              ) : (
                displayAmount(balance)
              )}
            </div>
          </div>
        </div>

        {/* Credit card specific info */}
        {isCredit && (
          <CreditCardInfo
            creditUsed={creditUsed}
            creditLimit={account.creditLimit!}
            nextCutoff={nextCutoff}
            nextPayment={nextPayment}
            interestRate={account.interestRate}
            formatCurrency={formatCurrency}
            isAssociated={isAssociated}
          />
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={onEdit} className="btn-edit">
            <Edit2 size={14} />
            Editar
          </button>

          {isCredit && onMerge && (
            <button
              onClick={onMerge}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] text-primary bg-primary/10 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Combine size={14} />
              Unificar
            </button>
          )}

          {!account.isDefault && (
            <>
              <button
                onClick={onSetDefault}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] text-primary bg-primary/10 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Marcar como principal
              </button>
              <button
                onClick={onDelete}
                className="flex items-center justify-center p-2 min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive hover:bg-destructive-muted rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

AccountCard.displayName = 'AccountCard';

// Sub-componente para info de tarjeta de crédito
interface CreditCardInfoProps {
  creditUsed: number;
  creditLimit: number;
  nextCutoff: Date | null;
  nextPayment: Date | null;
  interestRate?: number;
  formatCurrency: (amount: number) => string;
  isAssociated: boolean;
}

const CreditCardInfo: React.FC<CreditCardInfoProps> = memo(({
  creditUsed,
  creditLimit,
  nextCutoff,
  nextPayment,
  interestRate,
  formatCurrency,
  isAssociated,
}) => {
  const { hideBalances } = useUIPreferences();
  const usagePercentage = creditLimit > 0 ? Math.min((creditUsed / creditLimit) * 100, 100) : 0;
  const isHighUsage = creditLimit > 0 && creditUsed > creditLimit * 0.8;

  const displayAmount = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);

  return (
    <div className="mt-4">
      <div className={`flex justify-between ${isAssociated ? 'text-xs sm:text-sm' : 'text-sm'} mb-1.5`}>
        <span className="text-muted-foreground">Cupo utilizado</span>
        <span className="font-medium text-foreground">
          {displayAmount(creditUsed)} / {displayAmount(creditLimit)}
        </span>
      </div>

      <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full transition-[width,background-color] ${isHighUsage ? 'bg-warning' : 'bg-primary'}`}
          style={{ width: `${usagePercentage}%` }}
        />
      </div>

      <div className={`flex flex-wrap gap-x-4 gap-y-1 mt-3 ${isAssociated ? 'text-xs sm:text-sm' : 'text-sm'}`}>
        <div>
          <span className="text-muted-foreground">Corte: </span>
          <span className="font-medium text-foreground">
            {nextCutoff ? nextCutoff.toLocaleDateString('es-CO') : 'Sin definir'}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Pago: </span>
          <span className="font-medium text-foreground">
            {nextPayment ? nextPayment.toLocaleDateString('es-CO') : 'Sin definir'}
          </span>
        </div>
        {interestRate && interestRate > 0 && (
          <div>
            <span className="text-muted-foreground">Tasa E.A.: </span>
            <span className="font-medium text-foreground">
              {interestRate.toFixed(2).replace('.', ',')}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

CreditCardInfo.displayName = 'CreditCardInfo';
