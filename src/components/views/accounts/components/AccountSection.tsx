'use client';

import React, { memo } from 'react';
import type { LucideIcon } from 'lucide-react';

export type AccountSectionTone = 'success' | 'destructive';

interface AccountSectionProps {
  /** Icono de la sección (Wallet para Disponible, CreditCard para Crédito). */
  icon: LucideIcon;
  /** Título de la sección: "Disponible" / "Crédito". */
  title: string;
  /** Texto descriptivo del subtotal ("Saldo disponible", "Deuda total"). */
  subtotalLabel: string;
  /** Subtotal ya formateado como moneda. */
  subtotalValue: string;
  /**
   * Tono del subtotal: verde (success) para el dinero disponible, rojo
   * (destructive) para la deuda de crédito. El color comunica la naturaleza
   * del dinero (disponible vs deuda), no es decoración.
   */
  tone: AccountSectionTone;
  /** Nº de cuentas en la sección, para el badge del encabezado. */
  count: number;
  /** id del heading, para enlazarlo con la región vía aria-labelledby. */
  headingId: string;
  /** Contenido extra bajo el encabezado (p. ej. la vista consolidada de TC). */
  summarySlot?: React.ReactNode;
  children: React.ReactNode;
}

const TONE_CLASSES: Record<AccountSectionTone, string> = {
  success: 'text-success',
  destructive: 'text-destructive',
};

/**
 * Sección de cuentas agrupadas por naturaleza del dinero.
 *
 * Encabezado con icono + título + contador y un SUBTOTAL con color semántico
 * (verde = disponible, rojo = deuda). Es un landmark `region` etiquetado por su
 * heading para que lectores de pantalla puedan saltar entre "Disponible" y
 * "Crédito". No contiene lógica financiera: recibe el subtotal ya calculado.
 */
export const AccountSection: React.FC<AccountSectionProps> = memo(({
  icon: Icon,
  title,
  subtotalLabel,
  subtotalValue,
  tone,
  count,
  headingId,
  summarySlot,
  children,
}) => {
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-border pb-3">
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg bg-primary/10 p-2 text-primary" aria-hidden="true">
            <Icon size={20} />
          </span>
          <h3 id={headingId} className="text-balance text-lg font-bold text-foreground">
            {title}
          </h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            {count}
          </span>
        </div>

        <div className="text-right">
          <p className="text-xs font-medium text-muted-foreground">{subtotalLabel}</p>
          <p className={`font-mono text-xl font-bold sm:text-2xl ${TONE_CLASSES[tone]}`}>
            {subtotalValue}
          </p>
        </div>
      </header>

      {summarySlot}

      <div className="space-y-4">
        {children}
      </div>
    </section>
  );
});

AccountSection.displayName = 'AccountSection';
