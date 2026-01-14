'use client';

import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  X, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  Repeat,
  CalendarDays,
  TrendingUp,
  History,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { RecurringPayment, Account, Transaction } from '../../types/finance';
import { formatNumberForInput, unformatNumber } from '../../utils/formatters';

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

export const RecurringPaymentsView: React.FC<RecurringPaymentsViewProps> = ({
  recurringPayments,
  accounts,
  transactions,
  categories,
  formatCurrency,
  addRecurringPayment,
  updateRecurringPayment,
  deleteRecurringPayment,
  isPaidForMonth,
  getNextDueDate,
  getDaysUntilDue,
  getPaymentHistory,
  stats
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState<RecurringPayment | null>(null);
  const [expandedPayment, setExpandedPayment] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<{
    name: string;
    amount: string;
    category: string;
    accountId: string;
    dueDay: number;
    frequency: 'monthly' | 'yearly';
    notes: string;
  }>({
    name: '',
    amount: '',
    category: '',
    accountId: '',
    dueDay: 1,
    frequency: 'monthly',
    notes: ''
  });

  const resetForm = () => {
    setFormData({
      name: '',
      amount: '',
      category: '',
      accountId: '',
      dueDay: 1,
      frequency: 'monthly',
      notes: ''
    });
    setAmountInput('');
    setEditingPayment(null);
    setShowForm(false);
  };

  const openEditForm = (payment: RecurringPayment) => {
    setEditingPayment(payment);
    // amountInput almacena el valor sin formato (solo dígitos)
    const rawAmount = payment.amount.toString();
    setAmountInput(rawAmount);
    setFormData({
      name: payment.name,
      amount: rawAmount,
      category: payment.category,
      accountId: payment.accountId || '',
      dueDay: payment.dueDay,
      frequency: payment.frequency,
      notes: payment.notes || ''
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    // Evitar múltiples envíos
    if (isSubmitting) return;

    if (!formData.name.trim()) {
      toast.error('Ingresa un nombre para el pago');
      return;
    }

    const amount = parseFloat(formData.amount.replace(/\./g, '').replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      toast.error('Ingresa un monto válido');
      return;
    }

    if (!formData.category) {
      toast.error('Selecciona una categoría');
      return;
    }

    setIsSubmitting(true);

    try {
      // Construir datos del pago
      const paymentData: Omit<RecurringPayment, 'id' | 'createdAt'> = {
        name: formData.name.trim(),
        amount,
        category: formData.category,
        dueDay: formData.dueDay,
        frequency: formData.frequency,
        isActive: true,
        ...(formData.accountId && { accountId: formData.accountId }),
        ...(formData.notes.trim() && { notes: formData.notes.trim() })
      };

      if (editingPayment) {
        await updateRecurringPayment(editingPayment.id!, paymentData);
        toast.success('Pago actualizado');
      } else {
        await addRecurringPayment(paymentData);
        toast.success('Pago periódico creado');
      }

      resetForm();
    } catch (error) {
      toast.error('Error al guardar');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRecurringPayment(id);
      toast.success('Pago eliminado');
      setDeleteConfirm(null);
    } catch (error) {
      toast.error('Error al eliminar');
    }
  };

  const toggleActive = async (payment: RecurringPayment) => {
    await updateRecurringPayment(payment.id!, { isActive: !payment.isActive });
    toast.success(payment.isActive ? 'Pago pausado' : 'Pago activado');
  };

  // Ordenar pagos: primero los pendientes por días hasta vencer, luego los pagados
  const sortedPayments = useMemo(() => {
    const now = new Date();
    return [...recurringPayments]
      .filter(p => p.isActive)
      .sort((a, b) => {
        const aPaid = isPaidForMonth(a.id!, now);
        const bPaid = isPaidForMonth(b.id!, now);
        
        // Pendientes primero
        if (aPaid !== bPaid) return aPaid ? 1 : -1;
        
        // Luego por días hasta vencer
        return getDaysUntilDue(a) - getDaysUntilDue(b);
      });
  }, [recurringPayments, isPaidForMonth, getDaysUntilDue]);

  const inactivePayments = recurringPayments.filter(p => !p.isActive);

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
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary"
          >
            <Plus size={18} />
            Nuevo Pago
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Repeat size={18} className="text-purple-600 dark:text-purple-400" />
              <span className="text-xs font-medium text-purple-600 dark:text-purple-400">Activos</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.active}</p>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Pagados</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.paidThisMonth}</p>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={18} className="text-amber-600 dark:text-amber-400" />
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Pendientes</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.pendingThisMonth}</p>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={18} className="text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Total/Mes</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {formatCurrency(stats.totalMonthlyAmount)}
            </p>
          </div>
        </div>
      </div>

      {/* Alertas de pagos próximos */}
      {stats.upcomingPayments.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />
            <h3 className="font-semibold text-amber-800 dark:text-amber-200">
              Pagos próximos a vencer
            </h3>
          </div>
          <div className="space-y-2">
            {stats.upcomingPayments.map(payment => (
              <div 
                key={payment.id} 
                className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3"
              >
                <div>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{payment.name}</span>
                  <span className="ml-2 text-sm text-gray-500">
                    vence en {getDaysUntilDue(payment)} días
                  </span>
                </div>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrency(payment.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de pagos activos */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Pagos Activos
        </h3>

        {sortedPayments.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            <Repeat size={48} className="mx-auto mb-3 opacity-30" />
            <p>No tienes pagos periódicos configurados</p>
            <button 
              onClick={() => setShowForm(true)}
              className="mt-4 text-purple-600 dark:text-purple-400 hover:underline"
            >
              Crear tu primer pago
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedPayments.map(payment => {
              const isPaid = isPaidForMonth(payment.id!);
              const daysUntil = getDaysUntilDue(payment);
              const nextDue = getNextDueDate(payment);
              const account = accounts.find(a => a.id === payment.accountId);
              const history = getPaymentHistory(payment.id!, 6);
              const isExpanded = expandedPayment === payment.id;

              return (
                <div 
                  key={payment.id}
                  className={`border rounded-xl overflow-hidden transition-all ${
                    isPaid 
                      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10' 
                      : daysUntil <= 3 
                        ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {isPaid ? (
                            <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                          ) : daysUntil <= 3 ? (
                            <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                          ) : (
                            <Clock size={18} className="text-gray-400 flex-shrink-0" />
                          )}
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {payment.name}
                          </h4>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            {payment.category}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <CalendarDays size={14} />
                            Día {payment.dueDay} • {payment.frequency === 'monthly' ? 'Mensual' : 'Anual'}
                          </span>
                          {account && (
                            <span>
                              {account.name}
                            </span>
                          )}
                        </div>

                        {!isPaid && (
                          <p className="text-sm mt-2">
                            <span className={daysUntil <= 3 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-gray-500'}>
                              Próximo: {nextDue.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                              {daysUntil === 0 && ' (Hoy)'}
                              {daysUntil === 1 && ' (Mañana)'}
                              {daysUntil > 1 && ` (en ${daysUntil} días)`}
                            </span>
                          </p>
                        )}
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                          {formatCurrency(payment.amount)}
                        </p>
                        {isPaid && (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                            ✓ Pagado este mes
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                      <button
                        onClick={() => setExpandedPayment(isExpanded ? null : payment.id!)}
                        className="text-sm text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 flex items-center gap-1"
                      >
                        <History size={14} />
                        Historial
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>

                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditForm(payment)}
                          className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(payment.id!)}
                          className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Historial expandido */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 my-3">
                        Últimos pagos
                      </h5>
                      {history.length === 0 ? (
                        <p className="text-sm text-gray-400">Sin historial de pagos</p>
                      ) : (
                        <div className="space-y-2">
                          {history.map(t => (
                            <div 
                              key={t.id} 
                              className="flex items-center justify-between text-sm bg-white dark:bg-gray-800 rounded-lg p-2"
                            >
                              <span className="text-gray-600 dark:text-gray-400">
                                {new Date(t.date).toLocaleDateString('es-CO', { 
                                  day: 'numeric', 
                                  month: 'short',
                                  year: 'numeric'
                                })}
                              </span>
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {formatCurrency(t.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagos Inactivos */}
      {inactivePayments.length > 0 && (
        <div className="card opacity-60">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
            Pagos Pausados ({inactivePayments.length})
          </h3>
          <div className="space-y-2">
            {inactivePayments.map(payment => (
              <div 
                key={payment.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div>
                  <span className="font-medium text-gray-600 dark:text-gray-400">{payment.name}</span>
                  <span className="ml-2 text-sm text-gray-400">{formatCurrency(payment.amount)}</span>
                </div>
                <button
                  onClick={() => toggleActive(payment)}
                  className="text-sm text-purple-600 hover:underline"
                >
                  Reactivar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de Formulario */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {editingPayment ? 'Editar Pago Periódico' : 'Nuevo Pago Periódico'}
                </h3>
                <button
                  onClick={resetForm}
                  className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="label-base">Nombre *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Netflix, Spotify, Arriendo..."
                    className="input-base"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label-base">Monto *</label>
                    <input
                      type="text"
                      value={formatNumberForInput(amountInput)}
                      onChange={(e) => {
                        const rawValue = e.target.value.replace(/[^0-9]/g, '');
                        setAmountInput(rawValue);
                        setFormData({ ...formData, amount: rawValue });
                      }}
                      placeholder="0"
                      className="input-base"
                    />
                  </div>

                  <div>
                    <label className="label-base">Frecuencia</label>
                    <select
                      value={formData.frequency}
                      onChange={(e) => setFormData({ ...formData, frequency: e.target.value as 'monthly' | 'yearly' })}
                      className="input-base"
                    >
                      <option value="monthly">Mensual</option>
                      <option value="yearly">Anual</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label-base">Día de vencimiento</label>
                    <select
                      value={formData.dueDay}
                      onChange={(e) => setFormData({ ...formData, dueDay: parseInt(e.target.value) })}
                      className="input-base"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                        <option key={day} value={day}>Día {day}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label-base">Categoría *</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="input-base"
                    >
                      <option value="">Seleccionar...</option>
                      {categories.expense.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="label-base">Cuenta preferida (opcional)</label>
                  <select
                    value={formData.accountId}
                    onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                    className="input-base"
                  >
                    <option value="">Sin preferencia</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Puedes pagar desde cualquier cuenta al registrar el gasto</p>
                </div>

                <div>
                  <label className="label-base">Notas (opcional)</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Notas adicionales..."
                    className="input-base resize-none"
                    rows={2}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className={`btn-submit flex-1 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isSubmitting ? 'Guardando...' : editingPayment ? 'Actualizar' : 'Crear'}
                </button>
                <button
                  onClick={resetForm}
                  disabled={isSubmitting}
                  className="btn-cancel"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación de eliminación */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              ¿Eliminar pago periódico?
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">
              El pago será eliminado pero las transacciones asociadas se mantendrán.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Eliminar
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
