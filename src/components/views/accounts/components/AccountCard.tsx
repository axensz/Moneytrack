'use client';

import React, { memo, useMemo, useRef, useState, useCallback } from 'react';
import { Edit2, Trash2, GripVertical, ChevronUp, ChevronDown, Wallet, CreditCard, Banknote, Combine, AlertTriangle, Smartphone, Archive, ArchiveRestore, MoreHorizontal, Star } from 'lucide-react';
import type { Account } from '../../../../types/finance';
import { getCreditAuthorityState } from '../../../../utils/creditAuthority';
import { useUIPreferences } from '@/contexts/UIPreferencesContext';
import { useDismissable } from '@/hooks/useDismissable';
import { BalanceSettling } from '@/components/shared/BalanceSettling';
import { UI_LABELS } from '@/config/constants';
import {
  getAccountBalancePresentation,
  PROGRESS_BAR_TONE_CLASSES,
  type CreditBreakdownPresentation,
} from '../utils/accountBalancePresentation';

const ACCOUNT_TYPES = [
  { value: 'savings' as const, label: UI_LABELS.accountTypes.savings, icon: Wallet },
  { value: 'credit' as const, label: UI_LABELS.accountTypes.credit, icon: CreditCard },
  { value: 'cash' as const, label: UI_LABELS.accountTypes.cash, icon: Banknote },
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
  onManagePaymentInstruments?: () => void;
  /** Archivar la cuenta (ocúltala de lista/selectores, conserva historial). Ausente = sin acción. */
  onArchive?: () => void;
  /** Desarchivar la cuenta (vuelve a mostrarla). Ausente = sin acción. */
  onUnarchive?: () => void;
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
  onManagePaymentInstruments,
  onArchive,
  onUnarchive,
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
  const creditAuthority = getCreditAuthorityState(account);
  const authorityMessageId = `credit-authority-${account.id ?? 'unknown'}`;
  const accountTypeInfo = ACCOUNT_TYPES.find((t) => t.value === account.type);

  const presentation = useMemo(
    () =>
      getAccountBalancePresentation({
        account,
        balance,
        creditUsed,
        creditAuthority,
        balanceSettling,
        hideBalances,
        formatCurrency,
      }),
    [account, balance, creditUsed, creditAuthority, balanceSettling, hideBalances, formatCurrency]
  );

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
          <div className="flex-1 min-w-0">
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
              <div className="flex min-w-0 flex-1 items-center gap-2 flex-wrap">
                <h4
                  className={`min-w-0 max-w-full break-words font-semibold text-foreground ${isAssociated ? 'text-sm sm:text-base' : ''
                    }`}
                >
                  {account.name}
                </h4>
                {account.isDefault && (
                  <span className="text-xs text-primary-foreground px-2 py-0.5 rounded-full font-medium bg-primary-solid">
                    Principal
                  </span>
                )}
                {account.archived && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground px-2 py-0.5 rounded-full font-medium bg-muted">
                    <Archive size={12} aria-hidden="true" />
                    Archivada
                  </span>
                )}
              </div>
            </div>

            {/* Type badge */}
            <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary-on-surface">
              {accountTypeInfo?.label}
            </span>
            {parentAccountName && (
              <span className="ml-2 text-xs text-primary-on-surface">
                • {parentAccountName}
              </span>
            )}
          </div>

          {/* Balance */}
          <div className="text-left sm:text-right">
            <div
              className={`text-xl sm:text-2xl font-bold font-mono ${presentation.toneClass}`}
              aria-label={presentation.accessibleAmountLabel}
            >
              {presentation.primaryLabel && (
                <div className="text-xs font-normal font-sans text-muted-foreground mb-1">
                  {presentation.primaryLabel}
                </div>
              )}
              {presentation.isUnreconciled ? (
                <span className="text-base sm:text-lg font-sans">{presentation.unreconciledBadgeText}</span>
              ) : presentation.isSettling ? (
                <BalanceSettling className="text-base font-medium font-sans text-muted-foreground" />
              ) : (
                presentation.formattedAmount
              )}
            </div>
          </div>
        </div>

        {/* Credit card specific info */}
        {isCredit && (
          <CreditCardInfo
            creditBreakdown={presentation.credit}
            creditUsed={creditUsed}
            creditLimit={account.creditLimit ?? 0}
            nextCutoff={nextCutoff}
            nextPayment={nextPayment}
            monthlySpendingLimit={account.monthlySpendingLimit}
            interestRate={account.interestRate}
            formatCurrency={formatCurrency}
            isAssociated={isAssociated}
            authorityReady={creditAuthority.ready}
            authorityMessageId={authorityMessageId}
          />
        )}

        {/* Acciones: Editar y Medios de pago quedan visibles (las de uso
            frecuente); el resto (Unificar, Marcar principal, Archivar,
            Desarchivar, Eliminar) se agrupan en un menú "⋯" para bajar el ruido
            por fila sin quitar ninguna acción. */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button
            onClick={onEdit}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] text-primary-on-surface bg-card border border-border-accent hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Edit2 size={14} />
            Editar
          </button>

          {onManagePaymentInstruments && (
            <button
              type="button"
              onClick={onManagePaymentInstruments}
              aria-label={`Gestionar medios de pago de ${account.name}`}
              aria-haspopup="dialog"
              title="Medios de pago"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border p-2 text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Smartphone size={18} aria-hidden="true" />
            </button>
          )}

          <AccountCardActionsMenu
            account={account}
            isCredit={isCredit}
            authorityReady={creditAuthority.ready}
            authorityMessageId={authorityMessageId}
            onMerge={onMerge}
            onSetDefault={onSetDefault}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
            onDelete={onDelete}
          />
        </div>
      </div>
    </div>
  );
});

AccountCard.displayName = 'AccountCard';

// ─── Menú de acciones secundarias ("⋯") ──────────────────────────────────
// Agrupa las acciones de uso poco frecuente para que la fila respire, SIN
// quitar ninguna. Se despliega como disclosure en el flujo normal de la card
// (no absoluto): así no lo recorta el `overflow-hidden` del contenedor y no
// necesita portal. Cierra con clic fuera / Escape (useDismissable, WCAG 2.1.2)
// y devuelve el foco al disparador.
interface AccountCardActionsMenuProps {
  account: Account;
  isCredit: boolean;
  authorityReady: boolean;
  authorityMessageId: string;
  onMerge?: () => void;
  onSetDefault: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete: () => void;
}

const AccountCardActionsMenu: React.FC<AccountCardActionsMenuProps> = ({
  account,
  isCredit,
  authorityReady,
  authorityMessageId,
  onMerge,
  onSetDefault,
  onArchive,
  onUnarchive,
  onDelete,
}) => {
  const [open, setOpen] = useState(false);
  // Posición del panel en coordenadas de viewport. El panel se renderiza con
  // `position: fixed` para escapar del `overflow-hidden` de la card (si no, se
  // recortaría). Se recalcula al abrir.
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismissable({ isOpen: open, onClose: close, ref: menuRef, triggerRef });

  const openMenu = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setCoords({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setOpen(true);
  }, []);

  // Envuelve cada acción para cerrar el menú tras ejecutarla.
  const run = (fn?: () => void) => () => {
    close();
    fn?.();
  };

  // ¿Hay algo que mostrar? Si no, no renderizamos el disparador.
  const showMerge = isCredit && !!onMerge;
  const showUnarchive = !!account.archived && !!onUnarchive;
  const showSetDefault = !account.isDefault && !account.archived;
  const showArchive = !account.isDefault && !account.archived && !!onArchive;
  const showDelete = !account.isDefault;
  const hasAnyAction = showMerge || showUnarchive || showSetDefault || showArchive || showDelete;
  if (!hasAnyAction) return null;

  const menuItemClass =
    'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : openMenu())}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Más acciones para ${account.name}`}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>

      {open && coords && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Acciones de ${account.name}`}
          style={{ position: 'fixed', top: coords.top, right: coords.right }}
          className="z-50 w-56 overflow-hidden rounded-lg border border-border bg-card py-1 text-card-foreground shadow-lg animate-in fade-in zoom-in-95 duration-150"
        >
          {showMerge && (
            <button
              type="button"
              role="menuitem"
              onClick={run(onMerge)}
              disabled={!authorityReady}
              aria-describedby={!authorityReady ? authorityMessageId : undefined}
              className={`${menuItemClass} text-foreground hover:bg-muted`}
            >
              <Combine size={16} className="text-primary" aria-hidden="true" />
              Unificar tarjetas
            </button>
          )}

          {showUnarchive && (
            <button
              type="button"
              role="menuitem"
              onClick={run(onUnarchive)}
              className={`${menuItemClass} text-foreground hover:bg-muted`}
            >
              <ArchiveRestore size={16} className="text-primary" aria-hidden="true" />
              Desarchivar
            </button>
          )}

          {showSetDefault && (
            <button
              type="button"
              role="menuitem"
              onClick={run(onSetDefault)}
              className={`${menuItemClass} text-foreground hover:bg-muted`}
            >
              <Star size={16} className="text-primary" aria-hidden="true" />
              Marcar como principal
            </button>
          )}

          {showArchive && (
            <button
              type="button"
              role="menuitem"
              onClick={run(onArchive)}
              className={`${menuItemClass} text-foreground hover:bg-muted`}
            >
              <Archive size={16} className="text-muted-foreground" aria-hidden="true" />
              Archivar
            </button>
          )}

          {showDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={run(onDelete)}
              disabled={isCredit && !authorityReady}
              aria-describedby={isCredit && !authorityReady ? authorityMessageId : undefined}
              className={`${menuItemClass} text-destructive hover:bg-destructive-muted`}
            >
              <Trash2 size={16} aria-hidden="true" />
              Eliminar cuenta
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// Sub-componente para info de tarjeta de crédito
interface CreditCardInfoProps {
  creditBreakdown?: CreditBreakdownPresentation;
  creditUsed: number;
  creditLimit: number;
  nextCutoff: Date | null;
  nextPayment: Date | null;
  monthlySpendingLimit?: number;
  interestRate?: number;
  formatCurrency: (amount: number) => string;
  isAssociated: boolean;
  authorityReady: boolean;
  authorityMessageId: string;
}

const CreditCardInfo: React.FC<CreditCardInfoProps> = memo(({
  creditBreakdown,
  creditUsed,
  creditLimit,
  nextCutoff,
  nextPayment,
  monthlySpendingLimit,
  interestRate,
  formatCurrency,
  isAssociated,
  authorityReady,
  authorityMessageId,
}) => {
  const { hideBalances } = useUIPreferences();
  const displayAmount = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);

  if (!authorityReady) {
    return (
      <div
        id={authorityMessageId}
        role="status"
        className="mt-4 flex items-start gap-2 rounded-lg bg-warning-muted p-3 text-sm text-warning"
      >
        <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">Requiere conciliación</p>
          <p className="mt-0.5 text-xs">
            La deuda persistida no es válida. MoneyTrack bloqueó unificación y eliminación hasta conciliarla.
          </p>
        </div>
      </div>
    );
  }

  const formattedUsed = creditBreakdown?.formattedUsed ?? displayAmount(creditUsed);
  const formattedLimit = creditBreakdown?.formattedLimit ?? displayAmount(creditLimit);
  const progressBarWidth = creditBreakdown?.progressBarWidth ?? (hideBalances ? '0%' : `${creditLimit > 0 ? Math.min(100, Math.max(0, (creditUsed / creditLimit) * 100)) : 0}%`);
  const progressBarToneClass = creditBreakdown
    ? PROGRESS_BAR_TONE_CLASSES[creditBreakdown.progressBarTone]
    : 'bg-primary';

  return (
    <div className="mt-4">
      <div className={`flex justify-between ${isAssociated ? 'text-xs sm:text-sm' : 'text-sm'} mb-1.5`}>
        <span className="text-muted-foreground">Cupo utilizado</span>
        <span className="font-medium font-mono text-foreground">
          {formattedUsed} / {formattedLimit}
        </span>
      </div>

      <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden" aria-hidden="true">
        <div
          className={`h-full transition-[width,background-color] ${progressBarToneClass}`}
          style={{ width: progressBarWidth }}
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
        {!!interestRate && interestRate > 0 && (
          <div>
            <span className="text-muted-foreground">Tasa E.A.: </span>
            <span className="font-medium font-mono text-foreground">
              {interestRate.toFixed(2).replace('.', ',')}%
            </span>
          </div>
        )}
        {/* Guarda con !! para no filtrar un 0 literal cuando el tope es 0
            (React renderiza `0 && <JSX>` como "0"). */}
        {!!monthlySpendingLimit && monthlySpendingLimit > 0 && (
          <div>
            <span className="text-muted-foreground">Tope manual: </span>
            <span className="font-medium font-mono text-foreground">
              {displayAmount(monthlySpendingLimit)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

CreditCardInfo.displayName = 'CreditCardInfo';
