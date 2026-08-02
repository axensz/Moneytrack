'use client';

import React, { useRef, useState } from 'react';
import { HandCoins, Users, CheckCircle2, ArrowDownLeft, ArrowUpRight, Ban } from 'lucide-react';
import { useDebtsDomain, useAccountDomain } from '../../../hooks/useFinanceSelectors';
import { useUIPreferences } from '../../../contexts/UIPreferencesContext';
import { formatCurrency, parseCurrency, parseDateFromInput } from '../../../utils/formatters';
import { compareDebtsByNextPayment } from '../../../utils/debtPaymentSchedule';
import { showToast } from '../../../utils/toastHelpers';
import { ConfirmDialog } from '../../modals/ConfirmDialog';
import { ACTION_ICONS, sectionTitle, UI_TEXT } from '../../../config/ui';
import type { Debt } from '../../../types/finance';
import { DebtCard } from './components/DebtCard';
import { NewDebtForm, type DebtFormErrors } from './components/NewDebtForm';
import { FORGIVEN_LABELS } from './constants';
import { createInitialDebtFormData } from './utils/debtForm';
import {
  buildPaymentScheduleUpdates,
  createEmptyPaymentScheduleForm,
  createPaymentScheduleFormFromDebt,
  type PaymentScheduleFormState,
} from './utils/paymentScheduleForm';

const NewIcon = ACTION_ICONS.new;

/**
 * Vista de préstamos y deudas
 * Permite trackear dinero prestado y recibido con pagos parciales
 */
export const DebtsView: React.FC = () => {
  const {
    debts,
    addDebt,
    updateDebt,
    deleteDebt,
    registerDebtPayment,
    modifyDebtBalance,
    forgiveDebt,
    debtStats,
  } = useDebtsDomain();
  const { accounts } = useAccountDomain();
  const { hideBalances } = useUIPreferences();

  const [showForm, setShowForm] = useState(false);
  const [debtToDelete, setDebtToDelete] = useState<Debt | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [showPaymentScheduleForm, setShowPaymentScheduleForm] = useState<string | null>(null);
  const [paymentScheduleForm, setPaymentScheduleForm] = useState<PaymentScheduleFormState>(createEmptyPaymentScheduleForm());
  const [showSettled, setShowSettled] = useState(false);
  const [showForgive, setShowForgive] = useState<string | null>(null);
  const [isSubmittingDebt, setIsSubmittingDebt] = useState(false);
  const submittingDebtRef = useRef(false);

  // Balance modifier state
  const [showBalanceModifier, setShowBalanceModifier] = useState<string | null>(null);
  const [modifierAmount, setModifierAmount] = useState('');
  const [modifierOperation, setModifierOperation] = useState<'add' | 'subtract'>('add');

  // Form state
  const [formData, setFormData] = useState(createInitialDebtFormData);
  const [newDebtPaymentSchedule, setNewDebtPaymentSchedule] = useState<PaymentScheduleFormState>(createEmptyPaymentScheduleForm());
  const [newDebtFormErrors, setNewDebtFormErrors] = useState<DebtFormErrors>({});

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingDebtRef.current) return;

    setNewDebtFormErrors({});
    const amount = parseCurrency(formData.originalAmount);
    if (!formData.personName.trim()) {
      const message = 'Ingresa el nombre de la persona';
      setNewDebtFormErrors({ personName: message });
      showToast.error(message);
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      const message = 'El monto debe ser mayor a 0';
      setNewDebtFormErrors({ originalAmount: message });
      showToast.error(message);
      return;
    }

    const paymentSchedule = buildPaymentScheduleUpdates(newDebtPaymentSchedule);
    if (paymentSchedule.error || !paymentSchedule.updates) {
      const message = paymentSchedule.error || 'Revisa la próxima fecha de pago';
      setNewDebtFormErrors({ paymentSchedule: message });
      showToast.error(message);
      return;
    }

    submittingDebtRef.current = true;
    setIsSubmittingDebt(true);
    try {
      await addDebt({
      personName: formData.personName.trim(),
      type: formData.type,
      originalAmount: amount,
      remainingAmount: amount,
      description: formData.description.trim() || undefined,
      accountId: formData.accountId || undefined, // Convert empty string to undefined
      isSettled: false,
      lentDate: formData.lentDate ? parseDateFromInput(formData.lentDate) : undefined,
      dueDate: formData.dueDate ? parseDateFromInput(formData.dueDate) : undefined,
      ...paymentSchedule.updates,
    });

    showToast.success(formData.type === 'lent' ? 'Préstamo registrado' : 'Deuda registrada');
    setFormData(createInitialDebtFormData());
    setNewDebtPaymentSchedule(createEmptyPaymentScheduleForm());
    setNewDebtFormErrors({});
    setShowForm(false);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'No se pudo guardar el préstamo');
    } finally {
      submittingDebtRef.current = false;
      setIsSubmittingDebt(false);
    }
  };

  const handleCancelNewDebt = () => {
    if (isSubmittingDebt) return;
    setFormData(createInitialDebtFormData());
    setNewDebtPaymentSchedule(createEmptyPaymentScheduleForm());
    setNewDebtFormErrors({});
    setShowForm(false);
  };

  const handleToggleNewDebtForm = () => {
    if (showForm) {
      handleCancelNewDebt();
    } else {
      setNewDebtFormErrors({});
      setShowForm(true);
    }
  };

  const handlePayment = async (debtId: string) => {
    const amount = parseCurrency(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast.error('El monto debe ser mayor a 0');
      return;
    }

    // #24: No permitir registrar un pago mayor al saldo pendiente. El hook clampa
    // el monto efectivo, pero avisamos en el form para que el usuario no crea que
    // movió más dinero del que la deuda justifica.
    const debt = debts.find(d => d.id === debtId);
    if (debt && amount > debt.remainingAmount) {
      showToast.error(`El pago no puede superar el saldo pendiente (${formatCurrency(debt.remainingAmount)})`);
      return;
    }

    await registerDebtPayment(debtId, amount);
    showToast.success('Pago registrado');
    setPaymentAmount('');
    setShowPaymentForm(null);
  };

  const handleModifyBalance = async (debtId: string, operation: 'add' | 'subtract') => {
    const amount = parseCurrency(modifierAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast.error('El monto debe ser mayor a 0');
      return;
    }

    try {
      await modifyDebtBalance(debtId, amount, operation);
      showToast.success(operation === 'add' ? 'Saldo agregado' : 'Saldo restado');
      setModifierAmount('');
      setShowBalanceModifier(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error al modificar el saldo';
      showToast.error(errorMessage);
    }
  };

  const handleForgive = async (debtId: string, reason: NonNullable<Debt['forgivenReason']>) => {
    await forgiveDebt(debtId, reason);
    showToast.success('Deuda condonada');
    setShowForgive(null);
  };

  const handleOpenPaymentSchedule = (debt: Debt) => {
    if (showPaymentScheduleForm === debt.id) {
      setShowPaymentScheduleForm(null);
      return;
    }

    setPaymentScheduleForm(createPaymentScheduleFormFromDebt(debt));
    setShowPaymentScheduleForm(debt.id!);
    setShowPaymentForm(null);
    setShowBalanceModifier(null);
    setShowForgive(null);
  };

  const handleSavePaymentSchedule = async (debtId: string) => {
    const paymentSchedule = buildPaymentScheduleUpdates(paymentScheduleForm);
    if (paymentSchedule.error || !paymentSchedule.updates) {
      showToast.error(paymentSchedule.error || 'Revisa la próxima fecha de pago');
      return;
    }

    await updateDebt(debtId, paymentSchedule.updates);
    showToast.success('Próximo pago actualizado');
    setShowPaymentScheduleForm(null);
  };

  const handleDelete = (debt: Debt) => {
    setDebtToDelete(debt);
  };

  const confirmDelete = async () => {
    if (!debtToDelete) return;
    await deleteDebt(debtToDelete.id!);
    showToast.success('Eliminado');
    setDebtToDelete(null);
  };

  const activeDebts = debts.filter(d => !d.isSettled);
  const settledDebts = debts.filter(d => d.isSettled);
  const sortDebtsByNextPayment = (items: Debt[]) =>
    [...items].sort((a, b) => compareDebtsByNextPayment(a, b) || a.personName.localeCompare(b.personName));
  const lentDebts = sortDebtsByNextPayment(activeDebts.filter(d => d.type === 'lent'));
  const borrowedDebts = sortDebtsByNextPayment(activeDebts.filter(d => d.type === 'borrowed'));

  const displayAmount = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);


  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Header con descripción */}
      <div className="card">
        <div className="mb-6">
          <h2 id="view-heading-debts" tabIndex={-1} className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {sectionTitle('debts')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Controla el dinero que prestas y debes
          </p>
        </div>

        {/* Stats Cards - planas y neutras (color = estado, no decoración) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="card-stat">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpRight className="text-gray-500 dark:text-gray-400" size={18} />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Me deben</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{displayAmount(debtStats.totalLent)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {debtStats.activeLentCount} activo{debtStats.activeLentCount !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="card-stat">
            <div className="flex items-center gap-2 mb-2">
              <ArrowDownLeft className="text-gray-500 dark:text-gray-400" size={18} />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Debo</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{displayAmount(debtStats.totalBorrowed)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {debtStats.activeBorrowedCount} activo{debtStats.activeBorrowedCount !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="card-stat">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="text-gray-500 dark:text-gray-400" size={18} />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Saldados</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{debtStats.settledCount}</p>
          </div>

          <div className="card-stat">
            <div className="flex items-center gap-2 mb-2">
              <Users className="text-gray-500 dark:text-gray-400" size={18} />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Balance neto</span>
            </div>
            {/* Único color por estado real: positivo = a tu favor, negativo = en contra */}
            <p className={`text-xl sm:text-2xl font-bold ${debtStats.totalLent - debtStats.totalBorrowed >= 0 ? 'text-success' : 'text-destructive'}`}>
              {displayAmount(debtStats.totalLent - debtStats.totalBorrowed)}
            </p>
          </div>
        </div>
      </div>

      {/* Main Card */}
      <div className="card">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Gestionar préstamos
          </h3>
          <button
            type="button"
            onClick={handleToggleNewDebtForm}
            className="btn-primary text-sm"
          >
            <NewIcon size={18} />
            <span className="hidden sm:inline">{UI_TEXT.actions.new}</span>
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <NewDebtForm
            accounts={accounts}
            errors={newDebtFormErrors}
            formData={formData}
            isSubmitting={isSubmittingDebt}
            paymentSchedule={newDebtPaymentSchedule}
            onCancel={handleCancelNewDebt}
            onSubmit={handleSubmit}
            setFormData={setFormData}
            setPaymentSchedule={setNewDebtPaymentSchedule}
          />
        )}

        {/* Active Debts - Lent */}
        {lentDebts.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
              <ArrowUpRight size={14} className="text-gray-400 dark:text-gray-500" />
              Me deben ({lentDebts.length})
            </h4>
            <div className="space-y-2">
              {lentDebts.map(debt => (
                <DebtCard
                  key={debt.id}
                  debt={debt}
                  formatCurrency={formatCurrency}
                  showPaymentForm={showPaymentForm}
                  setShowPaymentForm={setShowPaymentForm}
                  paymentAmount={paymentAmount}
                  setPaymentAmount={setPaymentAmount}
                  onPayment={handlePayment}
                  onDelete={handleDelete}
                  showBalanceModifier={showBalanceModifier}
                  setShowBalanceModifier={setShowBalanceModifier}
                  modifierAmount={modifierAmount}
                  setModifierAmount={setModifierAmount}
                  modifierOperation={modifierOperation}
                  setModifierOperation={setModifierOperation}
                  onModifyBalance={handleModifyBalance}
                  onForgive={handleForgive}
                  showForgive={showForgive}
                  setShowForgive={setShowForgive}
                  showPaymentScheduleForm={showPaymentScheduleForm}
                  paymentScheduleForm={paymentScheduleForm}
                  setPaymentScheduleForm={setPaymentScheduleForm}
                  onOpenPaymentSchedule={handleOpenPaymentSchedule}
                  onSavePaymentSchedule={handleSavePaymentSchedule}
                  setShowPaymentScheduleForm={setShowPaymentScheduleForm}
                />
              ))}
            </div>
          </div>
        )}

        {/* Active Debts - Borrowed */}
        {borrowedDebts.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
              <ArrowDownLeft size={14} className="text-gray-400 dark:text-gray-500" />
              Debo ({borrowedDebts.length})
            </h4>
            <div className="space-y-2">
              {borrowedDebts.map(debt => (
                <DebtCard
                  key={debt.id}
                  debt={debt}
                  formatCurrency={formatCurrency}
                  showPaymentForm={showPaymentForm}
                  setShowPaymentForm={setShowPaymentForm}
                  paymentAmount={paymentAmount}
                  setPaymentAmount={setPaymentAmount}
                  onPayment={handlePayment}
                  onDelete={handleDelete}
                  showBalanceModifier={showBalanceModifier}
                  setShowBalanceModifier={setShowBalanceModifier}
                  modifierAmount={modifierAmount}
                  setModifierAmount={setModifierAmount}
                  modifierOperation={modifierOperation}
                  setModifierOperation={setModifierOperation}
                  onModifyBalance={handleModifyBalance}
                  onForgive={handleForgive}
                  showForgive={showForgive}
                  setShowForgive={setShowForgive}
                  showPaymentScheduleForm={showPaymentScheduleForm}
                  paymentScheduleForm={paymentScheduleForm}
                  setPaymentScheduleForm={setPaymentScheduleForm}
                  onOpenPaymentSchedule={handleOpenPaymentSchedule}
                  onSavePaymentSchedule={handleSavePaymentSchedule}
                  setShowPaymentScheduleForm={setShowPaymentScheduleForm}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {activeDebts.length === 0 && !showForm && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <HandCoins size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay préstamos activos</p>
            <p className="text-xs mt-1">Registra un préstamo para empezar a rastrear</p>
          </div>
        )}

        {/* Settled toggle */}
        {settledDebts.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowSettled(!showSettled)}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {showSettled ? 'Ocultar' : 'Mostrar'} saldados ({settledDebts.length})
            </button>
            {showSettled && (
              <div className="mt-2 space-y-2 opacity-60">
                {settledDebts.map(debt => (
                  <div key={debt.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 line-through">
                        {debt.personName}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">{displayAmount(debt.originalAmount)}</span>
                      {debt.forgivenReason && (
                        <span className="text-xs text-warning ml-2">
                          Condonada · {FORGIVEN_LABELS[debt.forgivenReason]}
                        </span>
                      )}
                    </div>
                    {debt.forgivenReason ? (
                      <Ban size={16} className="text-warning" />
                    ) : (
                      <CheckCircle2 size={16} className="text-success" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal confirmación eliminar */}
      <ConfirmDialog
        isOpen={!!debtToDelete}
        title={`Eliminar ${debtToDelete?.type === 'lent' ? 'préstamo' : 'deuda'}`}
        message={debtToDelete && (
          <>
            ¿Estás seguro de eliminar{' '}
            <span className="font-semibold text-gray-900 dark:text-white">
              {debtToDelete.type === 'lent' ? 'el préstamo a' : 'la deuda con'}{' '}
              {debtToDelete.personName}
            </span>
            ? Se eliminarán también sus transacciones vinculadas y se revertirán los
            saldos afectados. Esta acción no se puede deshacer.
          </>
        )}
        confirmLabel={UI_TEXT.actions.delete}
        onConfirm={confirmDelete}
        onClose={() => setDebtToDelete(null)}
      />
    </div>
  );
};
