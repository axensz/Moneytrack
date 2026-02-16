'use client';

import React, { useState } from 'react';
import { CreditCard, Calendar, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { useFinance } from '../../../contexts/FinanceContext';
import { useCreditCardStatement } from '../../../hooks/useCreditCardStatement';
import type { CreditCardStatement as StatementType } from '../../../hooks/useCreditCardStatement';

/**
 * Vista de estado de cuenta de tarjetas de crédito
 * Muestra el ciclo de facturación actual, gastos del periodo y fecha de pago
 */
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
  const { account, cycleStart, cycleEnd, paymentDueDate, totalCharges, totalPayments, balance, cycleTransactions } = statement;

  const now = new Date();
  const daysUntilPayment = Math.ceil((paymentDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isPaymentSoon = daysUntilPayment <= 5 && daysUntilPayment >= 0;
  const isOverdue = daysUntilPayment < 0;

  const formatDate = (date: Date) => date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });

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

      {/* Cycle info */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 mb-4">
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-2">
          <Calendar size={12} />
          <span>Ciclo: {formatDate(cycleStart)} — {formatDate(cycleEnd)}</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-gray-500">Cargos</p>
            <p className="text-sm font-bold text-red-600 dark:text-red-400">{formatCurrency(totalCharges)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Pagos</p>
            <p className="text-sm font-bold text-green-600 dark:text-green-400">{formatCurrency(totalPayments)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Saldo</p>
            <p className={`text-sm font-bold ${balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              {formatCurrency(Math.abs(balance))}
            </p>
          </div>
        </div>
      </div>

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
              {cycleTransactions.map(t => (
                <div key={t.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-sm">
                  <div className="flex-1 min-w-0">
                    <span className="text-gray-700 dark:text-gray-300">{t.category}</span>
                    {t.description && (
                      <span className="text-xs text-gray-500 ml-1.5">— {t.description}</span>
                    )}
                  </div>
                  <span className={`font-medium ml-2 ${
                    t.type === 'expense' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                  }`}>
                    {t.type === 'expense' ? '-' : '+'}{formatCurrency(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
