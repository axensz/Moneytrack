import { useMemo, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import type { RecurringPayment, Account, Transaction } from '../../../../types/finance';

interface UseRecurringPaymentsParams {
  recurringPayments: RecurringPayment[];
  accounts: Account[];
  isPaidForMonth: (paymentId: string, month?: Date) => boolean;
  getDaysUntilDue: (payment: RecurringPayment) => number;
  getNextDueDate: (payment: RecurringPayment) => Date;
  getPaymentHistory: (paymentId: string, limit?: number) => Transaction[];
  addRecurringPayment: (payment: Omit<RecurringPayment, 'id' | 'createdAt'>) => Promise<void>;
  updateRecurringPayment: (id: string, updates: Partial<RecurringPayment>) => Promise<void>;
  deleteRecurringPayment: (id: string) => Promise<void>;
}

/**
 * Hook para gestionar lógica de pagos periódicos
 * - Ordenamiento y filtrado de pagos
 * - Estado de modales y formularios
 * - Operaciones CRUD
 */
export const useRecurringPaymentsView = ({
  recurringPayments,
  accounts,
  isPaidForMonth,
  getDaysUntilDue,
  getNextDueDate,
  getPaymentHistory,
  addRecurringPayment,
  updateRecurringPayment,
  deleteRecurringPayment,
}: UseRecurringPaymentsParams) => {
  // Estado de modales
  const [showForm, setShowForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState<RecurringPayment | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Ordenar pagos: pendientes primero por proximidad, luego pagados
  const sortedPayments = useMemo(() => {
    const now = new Date();
    return [...recurringPayments]
      .filter((p) => p.isActive)
      .sort((a, b) => {
        const aPaid = isPaidForMonth(a.id!, now);
        const bPaid = isPaidForMonth(b.id!, now);

        // Pendientes primero
        if (aPaid !== bPaid) return aPaid ? 1 : -1;

        // Luego por días hasta vencer
        return getDaysUntilDue(a) - getDaysUntilDue(b);
      });
  }, [recurringPayments, isPaidForMonth, getDaysUntilDue]);

  // Pagos inactivos
  const inactivePayments = useMemo(
    () => recurringPayments.filter((p) => !p.isActive),
    [recurringPayments]
  );

  // Preparar datos de un pago para mostrar en la UI
  const getPaymentDisplayData = useCallback(
    (payment: RecurringPayment) => ({
      isPaid: isPaidForMonth(payment.id!),
      daysUntilDue: getDaysUntilDue(payment),
      nextDueDate: getNextDueDate(payment),
      account: accounts.find((a) => a.id === payment.accountId),
      history: getPaymentHistory(payment.id!, 6),
    }),
    [isPaidForMonth, getDaysUntilDue, getNextDueDate, accounts, getPaymentHistory]
  );

  // Handlers
  const openEditForm = useCallback((payment: RecurringPayment) => {
    setEditingPayment(payment);
    setShowForm(true);
  }, []);

  const closeForm = useCallback(() => {
    setEditingPayment(null);
    setShowForm(false);
  }, []);

  const handleSubmit = useCallback(
    async (data: Omit<RecurringPayment, 'id' | 'createdAt'>) => {
      if (editingPayment) {
        await updateRecurringPayment(editingPayment.id!, data);
      } else {
        await addRecurringPayment(data);
      }
      closeForm();
    },
    [editingPayment, updateRecurringPayment, addRecurringPayment, closeForm]
  );

  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return;

    try {
      await deleteRecurringPayment(deleteConfirm);
      toast.success('Pago eliminado');
      setDeleteConfirm(null);
    } catch {
      toast.error('Error al eliminar');
    }
  }, [deleteConfirm, deleteRecurringPayment]);

  const handleReactivate = useCallback(
    async (payment: RecurringPayment) => {
      await updateRecurringPayment(payment.id!, { isActive: true });
      toast.success('Pago reactivado');
    },
    [updateRecurringPayment]
  );

  const confirmDelete = useCallback((paymentId: string) => {
    setDeleteConfirm(paymentId);
  }, []);

  const cancelDelete = useCallback(() => {
    setDeleteConfirm(null);
  }, []);

  return {
    // Data
    sortedPayments,
    inactivePayments,
    getPaymentDisplayData,

    // Form state
    showForm,
    editingPayment,
    openEditForm,
    closeForm,
    handleSubmit,

    // Delete state
    deleteConfirm,
    confirmDelete,
    cancelDelete,
    handleDelete,

    // Actions
    handleReactivate,
    setShowForm,
  };
};
