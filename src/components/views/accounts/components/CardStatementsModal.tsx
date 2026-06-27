'use client';

import React, { useMemo, useState } from 'react';
import { Receipt, ChevronDown, ChevronUp } from 'lucide-react';
import { BaseModal } from '@/components/modals/BaseModal';
import { useUIPreferences } from '@/contexts/UIPreferencesContext';
import { roundMoney } from '@/utils/formatters';
import type { MonthGroup, CardMonthPayment, CycleStatus } from '@/hooks/useCardPaymentSchedule';
import { BalanceComparisonSection } from './BalanceComparisonSection';

interface CardStatementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: MonthGroup[];
  formatCurrency: (n: number) => string;
  /** Saldo real (usedCredit persistido) por tarjeta, para la comparación de saldos. */
  usedCreditByCard?: Record<string, number>;
}

const STATUS_META: Record<CycleStatus, { label: string; cls: string }> = {
  paid: { label: 'Pagado', cls: 'bg-success-muted text-success' },
  partial: { label: 'Parcial', cls: 'bg-warning-muted text-warning' },
  pending: { label: 'Pendiente', cls: 'bg-destructive-muted text-destructive' },
  projected: { label: 'Proyectado', cls: 'bg-primary/10 text-primary' },
};

export function CardStatementsModal({ isOpen, onClose, schedule, formatCurrency, usedCreditByCard }: CardStatementsModalProps) {
  const [filter, setFilter] = useState<'all' | string>('all');

  const cardOptions = useMemo(() => {
    const m = new Map<string, string>();
    schedule.forEach(g => g.cards.forEach(c => m.set(c.cardId, c.cardName)));
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [schedule]);

  const view = useMemo(() => {
    if (filter === 'all') return schedule;
    return schedule
      .map(g => {
        const cards = g.cards.filter(c => c.cardId === filter);
        return {
          ...g, cards,
          total: roundMoney(cards.reduce((s, c) => s + c.statementTotal, 0)),
          remaining: roundMoney(cards.reduce((s, c) => s + c.remaining, 0)),
        };
      })
      .filter(g => g.cards.length > 0);
  }, [schedule, filter]);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Extractos de tarjetas"
      titleIcon={<Receipt size={20} className="text-primary" />}
      maxWidth="max-w-lg"
    >
      {cardOptions.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>Todas</FilterChip>
          {cardOptions.map(c => (
            <FilterChip key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)}>{c.name}</FilterChip>
          ))}
        </div>
      )}

      {view.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="rounded-full bg-success-muted p-3 text-success">
            <Receipt size={24} />
          </div>
          <p className="text-sm text-muted-foreground">
            Todo al día: no tienes pagos de tarjeta pendientes.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {view.map(g => <MonthPaymentRow key={g.monthKey} group={g} formatCurrency={formatCurrency} usedCreditByCard={usedCreditByCard} />)}
        </div>
      )}
    </BaseModal>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        active
          ? 'bg-primary-solid text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-border'
      }`}
    >
      {children}
    </button>
  );
}

function MonthPaymentRow({ group, formatCurrency, usedCreditByCard }: { group: MonthGroup; formatCurrency: (n: number) => string; usedCreditByCard?: Record<string, number> }) {
  const { hideBalances } = useUIPreferences();
  const [open, setOpen] = useState(group.isCurrent);
  const show = (n: number) => (hideBalances ? '••••••' : formatCurrency(n));

  return (
    <div
      className={`rounded-xl border ${
        group.isCurrent
          ? 'border-border-accent bg-primary/5'
          : 'border-border'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
          <span className="font-semibold capitalize text-foreground">{group.label}</span>
          {group.isCurrent && (
            <span className="rounded-full bg-primary-solid px-2 py-0.5 text-xs font-medium text-primary-foreground">Este mes</span>
          )}
        </span>
        <span className="font-bold text-foreground">{show(group.remaining)}</span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-border px-3 pb-3 pt-2">
          {group.cards.map(c => (
            <CardRow
              key={c.cardId}
              card={c}
              show={show}
              usedCredit={usedCreditByCard?.[c.cardId]}
              formatCurrency={formatCurrency}
              hideBalances={hideBalances}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CardRow({ card, show, usedCredit, formatCurrency, hideBalances }: {
  card: CardMonthPayment;
  show: (n: number) => string;
  usedCredit?: number;
  formatCurrency?: (n: number) => string;
  hideBalances?: boolean;
}) {
  const meta = STATUS_META[card.status];
  // card.projectedTotal solo está en el ciclo en curso (index 0). Ese ciclo NO siempre
  // cae en el grupo isCurrent (depende de si hoy es antes/después del corte), así que se
  // gatea por projectedTotal, no por group.isCurrent.
  const showComparison = card.projectedTotal != null && usedCredit != null && !!formatCurrency;
  return (
    <div className="rounded-lg bg-card p-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="font-medium text-foreground">{card.cardName}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${meta.cls}`}>{meta.label}</span>
        </span>
        <span className="font-semibold text-foreground">{show(card.remaining)}</span>
      </div>

      <p className="mt-0.5 text-xs text-muted-foreground">
        Vence {card.paymentDueDate.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}
      </p>

      {card.status === 'partial' && (
        <p className="mt-1 text-xs text-warning">
          Pagaste {show(card.paidAmount)} de {show(card.statementTotal)}
        </p>
      )}

      {(card.installmentItems.length > 0 || card.recurringItems.length > 0) && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
          {card.installmentItems.map((it, i) => (
            <li key={'i' + i} className="flex justify-between gap-2">
              <span className="truncate">{it.description} · cuota {it.cuota}/{it.total}</span>
              <span>{show(it.amount)}</span>
            </li>
          ))}
          {card.recurringItems.map((it, i) => (
            <li key={'r' + i} className="flex justify-between gap-2">
              <span className="truncate">{it.name} (periódico)</span>
              <span>{show(it.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      {showComparison && (
        <div className="mt-2">
          <BalanceComparisonSection
            usedCredit={usedCredit!}
            projectedTotal={card.projectedTotal!}
            totalProjectedDebt={card.totalProjectedDebt}
            formatCurrency={formatCurrency!}
            hideBalances={!!hideBalances}
          />
        </div>
      )}
    </div>
  );
}
