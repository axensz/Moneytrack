'use client';

import React, { useState, useRef } from 'react';
import { useConfirmDiscard } from '../../../../hooks/useConfirmDiscard';
import { showToast } from '../../../../utils/toastHelpers';
import { logger } from '../../../../utils/logger';
import type { RecurringPayment, Account } from '../../../../types/finance';
import { formatNumberForInput } from '../../../../utils/formatters';
import { BaseModal } from '../../../modals/BaseModal';
import { LAST_DAY_OF_MONTH } from '../../../../utils/recurringDates';

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

  // S13: snapshot del formulario al abrirse para detectar cambios pendientes.
  const initialFormRef = useRef<FormData>(INITIAL_FORM);

  // Reset form when modal opens/closes or editing payment changes
  React.useEffect(() => {
    if (isOpen) {
      const initial: FormData = editingPayment
        ? {
            name: editingPayment.name,
            amount: editingPayment.amount.toString(),
            category: editingPayment.category,
            accountId: editingPayment.accountId || '',
            dueDay: editingPayment.dueDay,
            frequency: editingPayment.frequency,
            notes: editingPayment.notes || '',
          }
        : INITIAL_FORM;
      initialFormRef.current = initial;
      setFormData(initial);
      setAmountInput(editingPayment ? editingPayment.amount.toString() : '');
    }
  }, [isOpen, editingPayment]);

  // S13: formulario "sucio" si el usuario modificó algún campo.
  const isDirty = JSON.stringify(formData) !== JSON.stringify(initialFormRef.current);
  const { guardedClose } = useConfirmDiscard(isDirty);

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
      logger.error('Error al guardar pago recurrente', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={() => guardedClose(onClose)}
      title={editingPayment ? 'Editar pago periódico' : 'Nuevo pago periódico'}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
            {/* Nombre */}
            <div>
              <label htmlFor="pf-name" className="label-base">Nombre *</label>
              <input
                id="pf-name"
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
                <label htmlFor="pf-amount" className="label-base">Monto *</label>
                <input
                  id="pf-amount"
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
                <label htmlFor="pf-frequency" className="label-base">Frecuencia</label>
                <select
                  id="pf-frequency"
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
                <label htmlFor="pf-due-day" className="label-base">Día de vencimiento</label>
                <select
                  id="pf-due-day"
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
                  <option value={LAST_DAY_OF_MONTH}>Último día</option>
                </select>
              </div>

              <div>
                <label htmlFor="pf-category" className="label-base">Categoría *</label>
                <select
                  id="pf-category"
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
              <label htmlFor="pf-account" className="label-base">Cuenta preferida (opcional)</label>
              <select
                id="pf-account"
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
              <p className="text-xs text-muted-foreground mt-1">
                Puedes pagar desde cualquier cuenta al registrar el gasto
              </p>
            </div>

            {/* Notas */}
            <div>
              <label htmlFor="pf-notes" className="label-base">Notas (opcional)</label>
              <textarea
                id="pf-notes"
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
              className={`btn-submit flex-1 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''
                }`}
            >
              {isSubmitting
                ? 'Guardando...'
                : editingPayment
                  ? 'Actualizar'
                  : 'Crear'}
            </button>
            <button
              onClick={() => guardedClose(onClose)}
              disabled={isSubmitting}
              className="btn-cancel"
            >
              Cancelar
            </button>
          </div>
    </BaseModal>
  );
};
