'use client';

import React, { useState, useMemo } from 'react';
import { Receipt, ChevronDown, ChevronUp } from 'lucide-react';
import { BaseModal } from '../../../modals/BaseModal';
import { useCardPaymentSchedule } from '../../../../hooks/useCardPaymentSchedule';
import type { MonthGroup, CardMonthPayment } from '../../../../hooks/useCardPaymentSchedule';
import type { Account, Transaction, RecurringPayment } from '../../../../types/finance';
import { BalanceComparisonSection } from './BalanceComparisonSection';

// ─── Props ─────────────────────────────────────────────────────────────────────

interface CardStatementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];               // credit cards only
  transactions: Transaction[];       // balanceTransactions (full history)
  recurringPayments: RecurringPayment[];
  formatCurrency: (amount: number) => string;
  hideBalances: boolean;
}

// ─── Status Badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<CardMonthPayment['status'], { bg: string; text: string; label: string }> = {
  paid: { bg: 'bg-success-muted', text: 'text-success', label: 'Pagado' },
  partial: { bg: 'bg-warning-muted', text: 'text-warning', label: 'Parcial' },
  pending: { bg: 'bg-destructive-muted', text: 'text-destructive', label: 'Pendiente' },
  projected: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Proyectado' },
};

function StatusBadge({ status, paidAmount, total, formatCurrency, hideBalances }: {
  status: CardMonthPayment['status'];
  paidAmount: number;
  total: number;
  formatCurrency: (amount: number) => string;
  hideBalances: boolean;
}) {
  const style = STATUS_STYLES[status];
  const label = status === 'partial' && !hideBalances
    ? `pagaste ${formatCurrency(paidAmount)} de ${formatCurrency(total)}`
    : status === 'partial' && hideBalances
      ? 'pagaste •••••• de ••••••'
      : style.label;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      {label}
    </span>
  );
}

// ─── Month Payment Row ─────────────────────────────────────────────────────────

function MonthPaymentRow({ group, formatCurrency, hideBalances, filterCardId, accounts }: {
  group: MonthGroup;
  formatCurrency: (amount: number) => string;
  hideBalances: boolean;
  filterCardId: string; // '' = all
  accounts: Account[];
}) {
  const [expanded, setExpanded] = useState(false);

  const filteredCards = useMemo(() => {
    if (!filterCardId) return group.cards;
    return group.cards.filter(c => c.cardId === filterCardId);
  }, [group.cards, filterCardId]);

  const displayTotal = useMemo(() => {
    if (!filterCardId) return group.total;
    return filteredCards.reduce((sum, c) => sum + c.statementTotal, 0);
  }, [filterCardId, filteredCards, group.total]);

  if (filteredCards.length === 0) return null;

  return (
    <div
      className={`rounded-xl border transition-colors ${
        group.isCurrent
          ? 'border-primary/40 bg-primary/5'
          : 'border-border bg-card'
      }`}
    >
      {/* Row header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 sm:p-4 text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold capitalize ${
            group.isCurrent ? 'text-primary' : 'text-foreground'
          }`}>
            {group.label}
          </span>
          {group.isCurrent && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">
              Actual
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${
            group.isCurrent ? 'text-primary' : 'text-foreground'
          }`}>
            {hideBalances ? '••••••' : formatCurrency(displayTotal)}
          </span>
          {expanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded card breakdown */}
      {expanded && (
        <div className="border-t border-border px-3 sm:px-4 pb-3 sm:pb-4 pt-2 divide-y divide-border">
          {filteredCards.map((card) => {
            // Only pass usedCredit for the current cycle month
            const account = group.isCurrent
              ? accounts.find(a => a.id === card.cardId)
              : undefined;
            const usedCredit = account?.usedCredit;

            return (
              <CardBreakdown
                key={card.cardId}
                card={card}
                formatCurrency={formatCurrency}
                hideBalances={hideBalances}
                usedCredit={usedCredit}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Card Breakdown ────────────────────────────────────────────────────────────

function CardBreakdown({ card, formatCurrency, hideBalances, usedCredit }: {
  card: CardMonthPayment;
  formatCurrency: (amount: number) => string;
  hideBalances: boolean;
  usedCredit?: number | null;
}) {
  const showBalanceComparison = usedCredit != null && card.projectedTotal != null;

  return (
    <div className="py-3 first:pt-1">
      {/* Card header with name + status */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{card.cardName}</span>
          <StatusBadge
            status={card.status}
            paidAmount={card.paidAmount}
            total={card.statementTotal}
            formatCurrency={formatCurrency}
            hideBalances={hideBalances}
          />
        </div>
        <span className="text-sm font-semibold text-foreground">
          {hideBalances ? '••••••' : formatCurrency(card.statementTotal)}
        </span>
      </div>

      {/* Balance comparison section — only when account has usedCredit defined */}
      {showBalanceComparison && (
        <div className="mb-2">
          <BalanceComparisonSection
            usedCredit={usedCredit}
            projectedTotal={card.projectedTotal!}
            totalProjectedDebt={card.totalProjectedDebt}
            formatCurrency={formatCurrency}
            hideBalances={hideBalances}
          />
        </div>
      )}

      {/* Installment items */}
      {card.installmentItems.length > 0 && (
        <ul className="space-y-1 ml-2">
          {card.installmentItems.map((item, idx) => (
            <li key={idx} className="text-xs text-muted-foreground flex justify-between">
              <span>
                {item.description}
                {item.total > 1 && (
                  <span className="text-muted-foreground ml-1">
                    cuota {item.cuota}/{item.total}
                  </span>
                )}
              </span>
              <span className="font-medium text-foreground">
                {hideBalances ? '••••••' : formatCurrency(item.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Recurring items */}
      {card.recurringItems.length > 0 && (
        <ul className={`space-y-1 ml-2 ${card.installmentItems.length > 0 ? 'mt-2' : ''}`}>
          {card.recurringItems.map((item, idx) => (
            <li key={idx} className="text-xs text-muted-foreground flex justify-between">
              <span>{item.name} <span className="text-muted-foreground">(periódico)</span></span>
              <span className="font-medium text-foreground">
                {hideBalances ? '••••••' : formatCurrency(item.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main Modal Component ──────────────────────────────────────────────────────

export const CardStatementsModal: React.FC<CardStatementsModalProps> = ({
  isOpen,
  onClose,
  accounts,
  transactions,
  recurringPayments,
  formatCurrency,
  hideBalances,
}) => {
  const [filterCardId, setFilterCardId] = useState('');
  const { months } = useCardPaymentSchedule(accounts, transactions, recurringPayments);

  // Filter cards list for dropdown
  const creditCards = useMemo(
    () => accounts.filter(a => a.type === 'credit' && a.cutoffDay && a.paymentDay),
    [accounts],
  );

  // Check if there are any visible months after filtering
  const hasVisibleMonths = useMemo(() => {
    if (!filterCardId) return months.length > 0;
    return months.some(g => g.cards.some(c => c.cardId === filterCardId));
  }, [months, filterCardId]);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Extractos de tarjetas"
      titleIcon={<Receipt size={20} className="text-primary" />}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        {/* Filter dropdown */}
        <div>
          <select
            value={filterCardId}
            onChange={(e) => setFilterCardId(e.target.value)}
            className="input-base text-sm"
            aria-label="Filtrar por tarjeta"
          >
            <option value="">Todas</option>
            {creditCards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>
        </div>

        {/* Month rows */}
        {hasVisibleMonths ? (
          <div className="space-y-2">
            {months.map((group) => (
              <MonthPaymentRow
                key={group.monthKey}
                group={group}
                formatCurrency={formatCurrency}
                hideBalances={hideBalances}
                filterCardId={filterCardId}
                accounts={accounts}
              />
            ))}
          </div>
        ) : (
          /* Empty state */
          <div className="text-center py-8">
            <Receipt size={32} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No tienes pagos de tarjeta pendientes.
            </p>
          </div>
        )}
      </div>
    </BaseModal>
  );
};
