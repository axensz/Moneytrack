'use client';

import React, { useMemo, useState } from 'react';
import { Receipt, ChevronDown, ChevronUp } from 'lucide-react';
import { BaseModal } from '@/components/modals/BaseModal';
import { useUIPreferences } from '@/contexts/UIPreferencesContext';
import { roundMoney } from '@/utils/formatters';
import type { MonthGroup, CardMonthPayment, CycleStatus } from '@/hooks/useCardPaymentSchedule';

interface CardStatementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: MonthGroup[];
  formatCurrency: (n: number) => string;
}

const STATUS_META: Record<CycleStatus, { label: string; cls: string }> = {
  paid: { label: 'Pagado', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  partial: { label: 'Parcial', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  pending: { label: 'Pendiente', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  projected: { label: 'Proyectado', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
};

export function CardStatementsModal({ isOpen, onClose, schedule, formatCurrency }: CardStatementsModalProps) {
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
      titleIcon={<Receipt size={20} className="text-purple-600 dark:text-purple-400" />}
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
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          No tienes pagos de tarjeta pendientes.
        </p>
      ) : (
        <div className="space-y-2">
          {view.map(g => <MonthPaymentRow key={g.monthKey} group={g} formatCurrency={formatCurrency} />)}
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
      className={`rounded-full px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
        active
          ? 'bg-purple-600 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
      }`}
    >
      {children}
    </button>
  );
}

function MonthPaymentRow({ group, formatCurrency }: { group: MonthGroup; formatCurrency: (n: number) => string }) {
  const { hideBalances } = useUIPreferences();
  const [open, setOpen] = useState(group.isCurrent);
  const show = (n: number) => (hideBalances ? '••••••' : formatCurrency(n));

  return (
    <div
      className={`rounded-xl border ${
        group.isCurrent
          ? 'border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-900/20'
          : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded-xl"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          <span className="font-semibold capitalize text-gray-900 dark:text-gray-100">{group.label}</span>
          {group.isCurrent && (
            <span className="rounded-full bg-purple-600 px-2 py-0.5 text-xs font-medium text-white">Este mes</span>
          )}
        </span>
        <span className="font-bold text-gray-900 dark:text-gray-100">{show(group.remaining)}</span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-gray-100 px-3 pb-3 pt-2 dark:border-gray-700">
          {group.cards.map(c => <CardRow key={c.cardId} card={c} show={show} />)}
        </div>
      )}
    </div>
  );
}

function CardRow({ card, show }: { card: CardMonthPayment; show: (n: number) => string }) {
  const meta = STATUS_META[card.status];
  return (
    <div className="rounded-lg bg-white/70 p-2.5 text-sm dark:bg-gray-800/60">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-gray-100">{card.cardName}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${meta.cls}`}>{meta.label}</span>
        </span>
        <span className="font-semibold text-gray-900 dark:text-gray-100">{show(card.remaining)}</span>
      </div>

      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
        Vence {card.paymentDueDate.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}
      </p>

      {card.status === 'partial' && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          Pagaste {show(card.paidAmount)} de {show(card.statementTotal)}
        </p>
      )}

      {(card.installmentItems.length > 0 || card.recurringItems.length > 0) && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
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
    </div>
  );
}
