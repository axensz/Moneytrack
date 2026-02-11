'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { showToast } from '../../../../utils/toastHelpers';
import type { RecurringPayment, Account } from '../../../../types/finance';
import { formatNumberForInput } from '../../../../utils/formatters';

interface PaymentFormModalProps {
  isOpen: boolean;
  editingPayment: RecurringPayment | null;
  accounts: Account[];
  categories: string[];
  onClose: () => void;
  onSubmit: (data: Omit<RecurringPayment, 'id' | 'createdAt'>) => Promise<void>;
}

interface FormData {
  name: string;
  amount: string;
  category: string;
  accountId: string;
  dueDay: number;
  frequency: 'monthly' | 'yearly';
  notes: string;
}

const INITIAL_FORM: FormData = {
  name: '',
  amount: '',
  category: '',
  accountId: '',
  dueDay: 1,
  frequency: 'monthly',
  notes: '',
};

/**
 * Modal para crear o editar un pago periódico
 */
export const PaymentFormModal: React.FC<PaymentFormModalProps> = ({
  isOpen,
  editingPayment,
  accounts,
  categories,
  onClose,
  onSubmit,
}) => {
  const [formData, setFormData] = useState<FormData>(() => {
    if (editingPayment) {
      return {
        name: editingPayment.name,
        amount: editingPayment.amount.toString(),
        category: editingPayment.category,
        accountId: editingPayment.accountId || '',
        dueDay: editingPayment.dueDay,
        frequency: editingPayment.frequency,
        notes: editingPayment.notes || '',
      };
    }
    return INITIAL_FORM;
  });

  const [amountInput, setAmountInput] = useState(
    editingPayment ? editingPayment.amount.toString() : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when modal opens/closes or editing payment changes
  React.useEffect(() => {
    if (isOpen) {
      if (editingPayment) {
        setFormData({
          name: editingPayment.name,
          amount: editingPayment.amount.toString(),
          category: editingPayment.category,
          accountId: editingPayment.accountId || '',
          dueDay: editingPayment.dueDay,
          frequency: editingPayment.frequency,
          notes: editingPayment.notes || '',
        });
        setAmountInput(editingPayment.amount.toString());
      } else {
        setFormData(INITIAL_FORM);
        setAmountInput('');
      }
    }
  }, [isOpen, editingPayment]);

  const handleSubmit = async () => {
    if (isSubmitting) return;

    if (!formData.name.trim()) {
      showToast.error('Ingresa un nombre para el pago');
      return;
    }

    const amount = parseFloat(formData.amount.replace(/\./g, '').replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      showToast.error('Ingresa un monto válido');
      return;
    }

    if (!formData.category) {
      showToast.error('Selecciona una categoría');
      return;
    }

    setIsSubmitting(true);

    try {
      const paymentData: Omit<RecurringPayment, 'id' | 'createdAt'> = {
        name: formData.name.trim(),
        amount,
        category: formData.category,
        dueDay: formData.dueDay,
        frequency: formData.frequency,
        isActive: true,
        ...(formData.accountId && { accountId: formData.accountId }),
        ...(formData.notes.trim() && { notes: formData.notes.trim() }),
      };

      await onSubmit(paymentData);
      showToast.success(editingPayment ? 'Pago actualizado' : 'Pago periódico creado');
      onClose();
    } catch (error) {
      showToast.error('Error al guardar');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {editingPayment ? 'Editar Pago Periódico' : 'Nuevo Pago Periódico'}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X size={24} />
            </button>
          </div>

          <div className="space-y-4">
            {/* Nombre */}
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

            {/* Monto y Frecuencia */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-base">Monto *</label>
                <input
                  type="text"
                  inputMode="decimal"
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
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      frequency: e.target.value as 'monthly' | 'yearly',
                    })
                  }
                  className="input-base"
                >
                  <option value="monthly">Mensual</option>
                  <option value="yearly">Anual</option>
                </select>
              </div>
            </div>

            {/* Día y Categoría */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-base">Día de vencimiento</label>
                <select
                  value={formData.dueDay}
                  onChange={(e) =>
                    setFormData({ ...formData, dueDay: parseInt(e.target.value) })
                  }
                  className="input-base"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>
                      Día {day}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label-base">Categoría *</label>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  className="input-base"
                >
                  <option value="">Seleccionar...</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Cuenta */}
            <div>
              <label className="label-base">Cuenta preferida (opcional)</label>
              <select
                value={formData.accountId}
                onChange={(e) =>
                  setFormData({ ...formData, accountId: e.target.value })
                }
                className="input-base"
              >
                <option value="">Sin preferencia</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Puedes pagar desde cualquier cuenta al registrar el gasto
              </p>
            </div>

            {/* Notas */}
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

          {/* Botones */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={`btn-submit flex-1 ${
                isSubmitting ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {isSubmitting
                ? 'Guardando...'
                : editingPayment
                ? 'Actualizar'
                : 'Crear'}
            </button>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="btn-cancel"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
