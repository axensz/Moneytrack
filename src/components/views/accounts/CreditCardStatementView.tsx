'use client';

import React, { useState } from 'react';
import { CreditCard, Calendar, ChevronDown, ChevronUp, AlertCircle, Wallet } from 'lucide-react';
import { useFinance } from '../../../contexts/FinanceContext';
import { useCreditCardStatement } from '../../../hooks/useCreditCardStatement';
import type { CreditCardStatement as StatementType } from '../../../hooks/useCreditCardStatement';
import type { Transaction } from '../../../types/finance';

export const CreditCardStatementView: React.FC = () => {
  const { accounts, transactions, formatCurrency } = useFinance();
  const statements = useCreditCardStatement(accounts, transactions);

  if (statements.length === 0) {
    return (
      <div className="card">
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <CreditCard size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay tarjetas de crédito configuradas</p>
          <p className="text-xs mt-1">Agrega una tarjeta con día de corte y pago para ver el estado de cuenta</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {statements.map(statement => (
        <StatementCard
          key={statement.account.id}
          statement={statement}
          formatCurrency={formatCurrency}
        />
      ))}
    </div>
  );
};

interface StatementCardProps {
  statement: StatementType;
  formatCurrency: (n: number) => string;
}

const StatementCard: React.FC<StatementCardProps> = ({ statement, formatCurrency }) => {
  const [showTransactions, setShowTransactions] = useState(false);
  const {
    account,
    cycleStart,
    cycleEnd,
    paymentDueDate,
    totalCharges,
    totalPayments,
    balance,
    cycleTransactions,
  } = statement;

  const now = new Date();
  const daysUntilPayment = Math.ceil((paymentDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isPaymentSoon = daysUntilPayment <= 5 && daysUntilPayment >= 0;
  const isOverdue = daysUntilPayment < 0;

  const creditLimit = account.creditLimit;
  const availableCredit = creditLimit != null ? creditLimit - Math.max(0, balance) : null;
  const utilizationPct = creditLimit ? Math.min(100, Math.round((Math.max(0, balance) / creditLimit) * 100)) : null;

  const formatDate = (date: Date) =>
    date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });

  // Determine the correct sign, color and label for a transaction in the context of this card.
  const getTxDisplay = (t: Transaction) => {
    const isIncomingPayment =
      t.type === 'income' ||
      (t.type === 'transfer' && t.toAccountId === account.id);
    const isOutgoingTransfer =
      t.type === 'transfer' && t.accountId === account.id;

    const sign = isIncomingPayment ? '+' : '-';
    const colorClass = isIncomingPayment
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-600 dark:text-red-400';

    let label: string;
    if (t.type === 'transfer' && t.toAccountId === account.id) {
      label = 'Pago de tarjeta';
    } else if (isOutgoingTransfer) {
      label = 'Avance de efectivo';
    } else {
      label = t.category;
    }

    // For installments show the monthly amount, not the full purchase amount.
    const displayAmount =
      t.installments && t.installments > 1
        ? (t.monthlyInstallmentAmount ?? t.amount)
        : t.amount;

    // Installment label: "Cuota 3/12"
    let installmentLabel: string | null = null;
    if (t.installments && t.installments > 1) {
      const tDate = new Date(t.date);
      const monthsElapsed =
        (cycleStart.getFullYear() - tDate.getFullYear()) * 12 +
        (cycleStart.getMonth() - tDate.getMonth());
      const installmentNum = Math.max(1, monthsElapsed + 1);
      installmentLabel = `Cuota ${installmentNum}/${t.installments}`;
    }

    return { sign, colorClass, label, displayAmount, installmentLabel };
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CreditCard size={20} className="text-purple-600" />
          <h3 className="text-base font-bold text-gray-900 dark:text-white">{account.name}</h3>
        </div>
        {(isPaymentSoon || isOverdue) && (
          <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
            isOverdue
              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
          }`}>
            <AlertCircle size={12} />
            {isOverdue ? 'Pago vencido' : `Pago en ${daysUntilPayment} días`}
          </div>
        )}
      </div>

      {/* Cycle summary */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 mb-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-2">
          <Calendar size={12} />
          <span>Ciclo: {formatDate(cycleStart)} — {formatDate(cycleEnd)}</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-gray-500">Cargos</p>
            <p className="text-sm font-bold text-red-600 dark:text-red-400">
              {formatCurrency(totalCharges)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Pagos</p>
            <p className="text-sm font-bold text-green-600 dark:text-green-400">
              {formatCurrency(totalPayments)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Saldo</p>
            <p className={`text-sm font-bold ${balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              {balance < 0 ? 'A favor: ' : ''}{formatCurrency(Math.abs(balance))}
            </p>
          </div>
        </div>
      </div>

      {/* Available credit bar — only when creditLimit is configured */}
      {creditLimit != null && availableCredit != null && utilizationPct != null && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 mb-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-2">
            <Wallet size={12} />
            <span>Cupo</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-2">
            <div>
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-300">
                {formatCurrency(creditLimit)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Utilizado</p>
              <p className="text-sm font-bold text-orange-600 dark:text-orange-400">
                {utilizationPct}%
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Disponible</p>
              <p className={`text-sm font-bold ${availableCredit <= 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {formatCurrency(Math.max(0, availableCredit))}
              </p>
            </div>
          </div>
          {/* Utilization progress bar */}
          <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                utilizationPct >= 90
                  ? 'bg-red-500'
                  : utilizationPct >= 70
                  ? 'bg-orange-400'
                  : 'bg-green-500'
              }`}
              style={{ width: `${utilizationPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Payment due date */}
      <div className={`flex items-center justify-between p-3 rounded-xl mb-3 ${
        isOverdue
          ? 'bg-red-50 dark:bg-red-900/20'
          : isPaymentSoon
          ? 'bg-amber-50 dark:bg-amber-900/20'
          : 'bg-blue-50 dark:bg-blue-900/20'
      }`}>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Fecha de pago</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {paymentDueDate.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <span className={`text-xs font-medium ${
          isOverdue ? 'text-red-600' : isPaymentSoon ? 'text-amber-600' : 'text-blue-600'
        }`}>
          {isOverdue
            ? `Vencido hace ${Math.abs(daysUntilPayment)} días`
            : `En ${daysUntilPayment} días`
          }
        </span>
      </div>

      {/* Transactions toggle */}
      {cycleTransactions.length > 0 && (
        <>
          <button
            onClick={() => setShowTransactions(!showTransactions)}
            className="flex items-center gap-1 text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 w-full justify-center"
          >
            {showTransactions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showTransactions ? 'Ocultar' : 'Ver'} movimientos del ciclo ({cycleTransactions.length})
          </button>

          {showTransactions && (
            <div className="mt-3 space-y-1.5 max-h-60 overflow-y-auto">
              {cycleTransactions.map(t => {
                const { sign, colorClass, label, displayAmount, installmentLabel } = getTxDisplay(t);
                return (
                  <div
                    key={`${t.id}-${t.date}`}
                    className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-gray-700 dark:text-gray-300">{label}</span>
                      {t.description && (
                        <span className="text-xs text-gray-500 ml-1.5">— {t.description}</span>
                      )}
                      {installmentLabel && (
                        <span className="text-xs text-purple-500 dark:text-purple-400 ml-1.5">
                          ({installmentLabel})
                        </span>
                      )}
                    </div>
                    <span className={`font-medium ml-2 ${colorClass}`}>
                      {sign}{formatCurrency(displayAmount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
