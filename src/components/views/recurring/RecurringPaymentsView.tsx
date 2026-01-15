'use client';

import React from 'react';
import { Plus, Repeat } from 'lucide-react';

import type { RecurringPayment, Account, Transaction } from '../../../types/finance';

// Componentes
import { RecurringStatsCards } from './components/RecurringStatsCards';
import { UpcomingPaymentsAlert } from './components/UpcomingPaymentsAlert';
import { RecurringPaymentCard } from './components/RecurringPaymentCard';
import { PaymentFormModal } from './components/PaymentFormModal';
import { DeletePaymentModal } from './components/DeletePaymentModal';
import { InactivePaymentsList } from './components/InactivePaymentsList';

// Hook
import { useRecurringPaymentsView } from './hooks/useRecurringPaymentsView';

interface RecurringPaymentsViewProps {
  recurringPayments: RecurringPayment[];
  accounts: Account[];
  transactions: Transaction[];
  categories: {
    expense: string[];
    income: string[];
  };
  formatCurrency: (amount: number) => string;
  addRecurringPayment: (payment: Omit<RecurringPayment, 'id' | 'createdAt'>) => Promise<void>;
  updateRecurringPayment: (id: string, updates: Partial<RecurringPayment>) => Promise<void>;
  deleteRecurringPayment: (id: string) => Promise<void>;
  isPaidForMonth: (paymentId: string, month?: Date) => boolean;
  getNextDueDate: (payment: RecurringPayment) => Date;
  getDaysUntilDue: (payment: RecurringPayment) => number;
  getPaymentHistory: (paymentId: string, limit?: number) => Transaction[];
  stats: {
    total: number;
    active: number;
    paidThisMonth: number;
    pendingThisMonth: number;
    totalMonthlyAmount: number;
    totalYearlyAmount: number;
    upcomingPayments: RecurringPayment[];
  };
}

/**
 * Vista principal de pagos periódicos
 * Muestra estadísticas, alertas y lista de pagos con formulario de gestión
 */
export const RecurringPaymentsView: React.FC<RecurringPaymentsViewProps> = ({
  recurringPayments,
  accounts,
  categories,
  formatCurrency,
  addRecurringPayment,
  updateRecurringPayment,
  deleteRecurringPayment,
  isPaidForMonth,
  getNextDueDate,
  getDaysUntilDue,
  getPaymentHistory,
  stats,
}) => {
  const {
    sortedPayments,
    inactivePayments,
    getPaymentDisplayData,
    showForm,
    editingPayment,
    openEditForm,
    closeForm,
    handleSubmit,
    deleteConfirm,
    confirmDelete,
    cancelDelete,
    handleDelete,
    handleReactivate,
    setShowForm,
  } = useRecurringPaymentsView({
    recurringPayments,
    accounts,
    isPaidForMonth,
    getDaysUntilDue,
    getNextDueDate,
    getPaymentHistory,
    addRecurringPayment,
    updateRecurringPayment,
    deleteRecurringPayment,
  });

  return (
    <div className="space-y-6">
      {/* Header con estadísticas */}
      <div className="card">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Pagos Periódicos
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Gestiona tus suscripciones y pagos recurrentes
            </p>
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus size={18} />
            Nuevo Pago
          </button>
        </div>

        <RecurringStatsCards
          active={stats.active}
          paidThisMonth={stats.paidThisMonth}
          pendingThisMonth={stats.pendingThisMonth}
          totalMonthlyAmount={stats.totalMonthlyAmount}
          formatCurrency={formatCurrency}
        />
      </div>

      {/* Alertas de pagos próximos */}
      <UpcomingPaymentsAlert
        upcomingPayments={stats.upcomingPayments}
        getDaysUntilDue={getDaysUntilDue}
        formatCurrency={formatCurrency}
      />

      {/* Lista de pagos activos */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Pagos Activos
        </h3>

        {sortedPayments.length === 0 ? (
          <EmptyState onCreateClick={() => setShowForm(true)} />
        ) : (
          <div className="space-y-3">
            {sortedPayments.map((payment) => {
              const displayData = getPaymentDisplayData(payment);
              return (
                <RecurringPaymentCard
                  key={payment.id}
                  payment={payment}
                  isPaid={displayData.isPaid}
                  daysUntilDue={displayData.daysUntilDue}
                  nextDueDate={displayData.nextDueDate}
                  account={displayData.account}
                  history={displayData.history}
                  formatCurrency={formatCurrency}
                  onEdit={() => openEditForm(payment)}
                  onDelete={() => confirmDelete(payment.id!)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Pagos inactivos */}
      <InactivePaymentsList
        payments={inactivePayments}
        formatCurrency={formatCurrency}
        onReactivate={handleReactivate}
      />

      {/* Modales */}
      <PaymentFormModal
        isOpen={showForm}
        editingPayment={editingPayment}
        accounts={accounts}
        categories={categories.expense}
        onClose={closeForm}
        onSubmit={handleSubmit}
      />

      <DeletePaymentModal
        isOpen={!!deleteConfirm}
        onConfirm={handleDelete}
        onClose={cancelDelete}
      />
    </div>
  );
};

// Componente interno para estado vacío
const EmptyState: React.FC<{ onCreateClick: () => void }> = ({ onCreateClick }) => (
  <div className="text-center py-12 text-gray-400 dark:text-gray-500">
    <Repeat size={48} className="mx-auto mb-3 opacity-30" />
    <p>No tienes pagos periódicos configurados</p>
    <button
      onClick={onCreateClick}
      className="mt-4 text-purple-600 dark:text-purple-400 hover:underline"
    >
      Crear tu primer pago
    </button>
  </div>
);
