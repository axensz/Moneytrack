'use client';

import React, { useCallback, useRef, useState } from 'react';
import {
  Edit2,
  Trash2,
  ChevronUp,
  ChevronDown,
  Combine,
  Smartphone,
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  Star,
} from 'lucide-react';
import type { Account } from '../../../../types/finance';
import { useDismissable } from '@/hooks/useDismissable';

/**
 * Acciones por cuenta compartidas entre la card de ESCRITORIO (AccountCard) y
 * las filas/tarjetas del rediseño MÓVIL (AccountRow, WalletCreditCard).
 *
 * Se extrajeron a un componente propio para NO duplicar la lógica del menú "⋯"
 * ni de los botones de reordenar por teclado. El contrato (aria-labels, menú
 * accesible, acciones) es idéntico al que ya verificaban los tests, así que el
 * comportamiento se conserva en ambos layouts.
 */

// ─── Botones de reordenar por teclado (WCAG 2.1.1) ─────────────────────────
interface AccountReorderButtonsProps {
  accountName: string;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

export const AccountReorderButtons: React.FC<AccountReorderButtonsProps> = ({
  accountName,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
}) => {
  if (!onMoveUp && !onMoveDown) return null;
  return (
    <div className="flex flex-col flex-shrink-0" role="group" aria-label={`Reordenar ${accountName}`}>
      <button
        type="button"
        onClick={onMoveUp}
        disabled={!canMoveUp}
        aria-label={`Mover ${accountName} hacia arriba`}
        className="flex items-center justify-center h-5 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ChevronUp size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={!canMoveDown}
        aria-label={`Mover ${accountName} hacia abajo`}
        className="flex items-center justify-center h-5 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ChevronDown size={14} aria-hidden="true" />
      </button>
    </div>
  );
};

// ─── Menú de acciones secundarias ("⋯") ────────────────────────────────────
// Agrupa las acciones de uso poco frecuente para que la fila respire, SIN
// quitar ninguna. Se renderiza con `position: fixed` para escapar del
// `overflow-hidden` de la card. Cierra con clic fuera / Escape (useDismissable)
// y AHORA también al hacer scroll o redimensionar (el panel usa coordenadas de
// viewport y se desanclaría del botón; cerrarlo lo mantiene coherente).
/**
 * Variante de superficie de la barra/menú:
 * - `surface` (por defecto): sobre card/fondo claro, usa tokens del sistema.
 * - `wallet`: integrada DENTRO de la tarjeta billetera, sobre su gradiente
 *   oscuro. Usa blanco/translúcidos para cumplir AA sobre el gradiente (el
 *   texto blanco ya está verificado ≥4.5:1 sobre ambos stops de marca).
 */
export type AccountActionsSurface = 'surface' | 'wallet';

interface AccountActionsMenuProps {
  account: Account;
  isCredit: boolean;
  authorityReady: boolean;
  authorityMessageId: string;
  surface?: AccountActionsSurface;
  onMerge?: () => void;
  onSetDefault: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete: () => void;
}

export const AccountActionsMenu: React.FC<AccountActionsMenuProps> = ({
  account,
  isCredit,
  authorityReady,
  authorityMessageId,
  surface = 'surface',
  onMerge,
  onSetDefault,
  onArchive,
  onUnarchive,
  onDelete,
}) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismissable({ isOpen: open, onClose: close, ref: menuRef, triggerRef });

  // FIX (review v1): el panel usa coordenadas de viewport, así que al hacer
  // scroll o redimensionar se desanclaba del botón. Se cierra en esos eventos
  // para que nunca quede "flotando" lejos de su disparador. Se usa `capture`
  // para enterarse del scroll de cualquier contenedor, no solo el de window.
  React.useEffect(() => {
    if (!open) return;
    const handleReposition = () => close();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [open, close]);

  const openMenu = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setCoords({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setOpen(true);
  }, []);

  const run = (fn?: () => void) => () => {
    close();
    fn?.();
  };

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
        className={
          surface === 'wallet'
            ? 'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/25 bg-black/15 p-2 text-white transition-colors hover:bg-black/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70'
            : 'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
        }
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

// ─── Barra de acciones (Editar + Medios de pago + menú "⋯") ─────────────────
interface AccountActionsBarProps {
  account: Account;
  isCredit: boolean;
  authorityReady: boolean;
  authorityMessageId: string;
  /** Superficie donde vive la barra: `surface` (card) o `wallet` (gradiente). */
  surface?: AccountActionsSurface;
  onEdit: () => void;
  onManagePaymentInstruments?: () => void;
  onMerge?: () => void;
  onSetDefault: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete: () => void;
}

export const AccountActionsBar: React.FC<AccountActionsBarProps> = ({
  account,
  isCredit,
  authorityReady,
  authorityMessageId,
  surface = 'surface',
  onEdit,
  onManagePaymentInstruments,
  onMerge,
  onSetDefault,
  onArchive,
  onUnarchive,
  onDelete,
}) => {
  const isWallet = surface === 'wallet';
  // Editar: en wallet usa un fondo OSCURO translúcido (bg-black/15) con texto
  // blanco. El overlay oscuro refuerza el contraste (blanco ≥6.4:1 sobre el
  // stop más claro de CUALQUIER gradiente de marca; un overlay blanco bajaría
  // a ~4:1 y fallaría AA). En surface conserva el violet-on-surface del sistema.
  const editClass = isWallet
    ? 'flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] text-white bg-black/15 border border-white/25 hover:bg-black/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70'
    : 'flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] text-primary-on-surface bg-card border border-border-accent hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';
  const iconBtnClass = isWallet
    ? 'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/25 bg-black/15 p-2 text-white transition-colors hover:bg-black/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70'
    : 'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border p-2 text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={onEdit} className={editClass}>
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
          className={iconBtnClass}
        >
          <Smartphone size={18} aria-hidden="true" />
        </button>
      )}

      <AccountActionsMenu
        account={account}
        isCredit={isCredit}
        authorityReady={authorityReady}
        authorityMessageId={authorityMessageId}
        surface={surface}
        onMerge={onMerge}
        onSetDefault={onSetDefault}
        onArchive={onArchive}
        onUnarchive={onUnarchive}
        onDelete={onDelete}
      />
    </div>
  );
};
