'use client';

import React, { useRef, useState } from 'react';
import { HandCoins, Users, CheckCircle2, ArrowDownLeft, ArrowUpRight, Trash2, X, DollarSign, AlertTriangle, Ban, CalendarClock } from 'lucide-react';
import { useDebtsDomain, useAccountDomain } from '../../../hooks/useFinanceSelectors';
import { useUIPreferences } from '../../../contexts/UIPreferencesContext';
import { formatCurrency, formatNumberForInput, unformatNumber, parseCurrency, formatDateForInput, parseDateFromInput, formatDate, formatRelativeTime } from '../../../utils/formatters';
import { ensureDate } from '../../../utils/dateUtils';
import { addMonthsClamped, compareDebtsByNextPayment, getDebtNextPaymentInfo, normalizePaymentDay } from '../../../utils/debtPaymentSchedule';
import { showToast } from '../../../utils/toastHelpers';
import { ConfirmDialog } from '../../modals/ConfirmDialog';
import { ACTION_ICONS, sectionTitle, UI_TEXT } from '../../../config/ui';
import type { Debt } from '../../../types/finance';

const FORGIVEN_LABELS: Record<NonNullable<Debt['forgivenReason']>, string> = {
  unpaid: 'No pagada',
  gift: 'Regalo',
  other: 'Otro',
};
const EditIcon = ACTION_ICONS.edit;
const NewIcon = ACTION_ICONS.new;

type PaymentScheduleMode = 'none' | 'monthly' | 'date' | 'months';

interface PaymentScheduleFormState {
  mode: PaymentScheduleMode;
  expectedPaymentDay: string;
  nextPaymentDate: string;
  monthsFromNow: string;
}

const PAYMENT_SCHEDULE_MODES: { mode: PaymentScheduleMode; label: string }[] = [
  { mode: 'none', label: 'Sin fecha' },
  { mode: 'monthly', label: 'Mensual' },
  { mode: 'date', label: 'Fecha' },
  { mode: 'months', label: 'Meses' },
];

const createEmptyPaymentScheduleForm = (): PaymentScheduleFormState => ({
  mode: 'none',
  expectedPaymentDay: '15',
  nextPaymentDate: '',
  monthsFromNow: '1',
});

const createInitialDebtFormData = () => ({
  personName: '',
  type: 'lent' as 'lent' | 'borrowed',
  originalAmount: '',
  description: '',
  accountId: '',
  lentDate: formatDateForInput(new Date()),
  dueDate: '',
});

const createPaymentScheduleFormFromDebt = (debt: Debt): PaymentScheduleFormState => {
  const expectedPaymentDay = normalizePaymentDay(debt.expectedPaymentDay);
  const nextPaymentDate = debt.nextPaymentDate
    ? formatDateForInput(ensureDate(debt.nextPaymentDate))
    : '';

  return {
    mode: expectedPaymentDay ? 'monthly' : nextPaymentDate ? 'date' : 'none',
    expectedPaymentDay: expectedPaymentDay ? String(expectedPaymentDay) : '15',
    nextPaymentDate,
    monthsFromNow: '1',
  };
};

const isDateInput = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

const buildPaymentScheduleUpdates = (
  form: PaymentScheduleFormState,
): { updates?: Pick<Debt, 'expectedPaymentDay' | 'nextPaymentDate'>; error?: string } => {
  if (form.mode === 'none') {
    return { updates: { expectedPaymentDay: undefined, nextPaymentDate: undefined } };
  }

  if (form.mode === 'monthly') {
    const expectedPaymentDay = Number(form.expectedPaymentDay);
    if (!Number.isInteger(expectedPaymentDay) || expectedPaymentDay < 1 || expectedPaymentDay > 31) {
      return { error: 'El día mensual debe estar entre 1 y 31' };
    }

    return {
      updates: {
        expectedPaymentDay,
        nextPaymentDate: form.nextPaymentDate && isDateInput(form.nextPaymentDate)
          ? parseDateFromInput(form.nextPaymentDate)
          : undefined,
      },
    };
  }

  if (form.mode === 'date') {
    if (!isDateInput(form.nextPaymentDate)) {
      return { error: 'Elige una fecha de próximo pago' };
    }

    return {
      updates: {
        expectedPaymentDay: undefined,
        nextPaymentDate: parseDateFromInput(form.nextPaymentDate),
      },
    };
  }

  const monthsFromNow = Number(form.monthsFromNow);
  if (!Number.isInteger(monthsFromNow) || monthsFromNow < 1 || monthsFromNow > 120) {
    return { error: 'Los meses deben estar entre 1 y 120' };
  }

  return {
    updates: {
      expectedPaymentDay: undefined,
      nextPaymentDate: addMonthsClamped(new Date(), monthsFromNow),
    },
  };
};

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

  const handleSubmit = async () => {
    if (submittingDebtRef.current) return;

    const amount = parseCurrency(formData.originalAmount);
    if (!formData.personName.trim()) {
      showToast.error('Ingresa el nombre de la persona');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      showToast.error('El monto debe ser mayor a 0');
      return;
    }

    const paymentSchedule = buildPaymentScheduleUpdates(newDebtPaymentSchedule);
    if (paymentSchedule.error || !paymentSchedule.updates) {
      showToast.error(paymentSchedule.error || 'Revisa la próxima fecha de pago');
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
    setShowForm(false);
  };

  const handleToggleNewDebtForm = () => {
    if (showForm) {
      handleCancelNewDebt();
    } else {
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

  // Cuenta seleccionada en el formulario (puede ser una tarjeta de crédito:
  // útil cuando prestas tu tarjeta — el cargo consume cupo y los cobros lo liberan).
  const selectedAccount = accounts.find(a => a.id === formData.accountId);
  const isCreditSelected = selectedAccount?.type === 'credit';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Header con descripción */}
      <div className="card">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
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
            onClick={handleToggleNewDebtForm}
            className="btn-primary text-sm"
          >
            <NewIcon size={18} />
            <span className="hidden sm:inline">{UI_TEXT.actions.new}</span>
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-muted rounded-xl p-5 mb-6 space-y-4 border border-border shadow-sm">
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => setFormData(f => ({ ...f, type: 'lent' }))}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-[background-color,box-shadow,transform,color] shadow-md hover:shadow-lg ${formData.type === 'lent'
                  ? 'bg-primary-solid text-white ring-2 ring-primary scale-105'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
              >
                <ArrowUpRight size={16} className="inline mr-2" />
                Yo presté
              </button>
              <button
                onClick={() => setFormData(f => ({ ...f, type: 'borrowed' }))}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-[background-color,box-shadow,transform,color] shadow-md hover:shadow-lg ${formData.type === 'borrowed'
                  ? 'bg-primary-solid text-white ring-2 ring-primary scale-105'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
              >
                <ArrowDownLeft size={16} className="inline mr-2" />
                Me prestaron
              </button>
            </div>

            <input
              type="text"
              value={formData.personName}
              onChange={e => setFormData(f => ({ ...f, personName: e.target.value }))}
              placeholder="Nombre de la persona"
              className="input-base"
            />

            <input
              type="text"
              inputMode="numeric"
              value={formatNumberForInput(formData.originalAmount)}
              onChange={e => setFormData(f => ({ ...f, originalAmount: unformatNumber(e.target.value) }))}
              placeholder="Monto"
              className="input-base"
            />

            <input
              type="text"
              value={formData.description}
              onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
              placeholder="Descripción (opcional)"
              className="input-base"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  {formData.type === 'lent' ? 'Fecha del préstamo' : 'Fecha en que recibí'}
                </label>
                <input
                  type="date"
                  value={formData.lentDate}
                  onChange={e => setFormData(f => ({ ...f, lentDate: e.target.value }))}
                  className="input-base"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Vencimiento <span className="text-muted-foreground font-normal">(opcional)</span>
                </label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={e => setFormData(f => ({ ...f, dueDate: e.target.value }))}
                  className="input-base"
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                <CalendarClock size={14} />
                Próximo pago <span className="text-muted-foreground font-normal">(opcional)</span>
              </label>
              <PaymentScheduleFields
                value={newDebtPaymentSchedule}
                onChange={setNewDebtPaymentSchedule}
              />
            </div>

            <select
              value={formData.accountId}
              onChange={e => setFormData(f => ({ ...f, accountId: e.target.value }))}
              className="input-base"
            >
              <option value="">Sin cuenta asociada (solo seguimiento)</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.type === 'credit' ? ' (Tarjeta de crédito)' : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
              {!formData.accountId
                ? 'Si eliges una cuenta, el préstamo y sus pagos moverán su saldo automáticamente.'
                : isCreditSelected
                  ? (formData.type === 'lent'
                      ? 'Se cargará a tu tarjeta (consume cupo). Los cobros abonarán a la tarjeta y liberan cupo.'
                      : 'Se abonará a tu tarjeta (reduce el saldo usado). Los pagos volverán a cargarla.')
                  : (formData.type === 'lent'
                      ? 'Se registrará un gasto en esa cuenta (sale el dinero). Los cobros entrarán como ingreso.'
                      : 'Se registrará un ingreso en esa cuenta (entra el dinero). Los pagos saldrán como gasto.')}
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={isSubmittingDebt}
                className="btn-submit flex-1 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingDebt ? 'Guardando...' : 'Registrar'}
              </button>
              <button
                onClick={handleCancelNewDebt}
                disabled={isSubmittingDebt}
                className="btn-cancel flex-1 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
            </div>
          </div>
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

interface PaymentScheduleFieldsProps {
  value: PaymentScheduleFormState;
  onChange: React.Dispatch<React.SetStateAction<PaymentScheduleFormState>>;
}

const PaymentScheduleFields: React.FC<PaymentScheduleFieldsProps> = ({ value, onChange }) => {
  const setField = (updates: Partial<PaymentScheduleFormState>) => {
    onChange(prev => ({ ...prev, ...updates }));
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {PAYMENT_SCHEDULE_MODES.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            onClick={() => setField({ mode })}
            className={`py-2 px-2 rounded-lg text-xs font-semibold transition-colors ${value.mode === mode
              ? 'bg-primary-solid text-white'
              : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {value.mode === 'monthly' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="block text-xs text-gray-500 dark:text-gray-400">Día aprox.</span>
            <input
              type="number"
              min={1}
              max={31}
              value={value.expectedPaymentDay}
              onChange={event => setField({ expectedPaymentDay: event.target.value })}
              className="input-base text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-gray-500 dark:text-gray-400">Esta vez</span>
            <input
              type="date"
              value={value.nextPaymentDate}
              onChange={event => setField({ nextPaymentDate: event.target.value })}
              className="input-base text-sm"
            />
          </label>
        </div>
      )}

      {value.mode === 'date' && (
        <label className="space-y-1 block">
          <span className="block text-xs text-gray-500 dark:text-gray-400">Fecha próxima</span>
          <input
            type="date"
            value={value.nextPaymentDate}
            onChange={event => setField({ nextPaymentDate: event.target.value })}
            className="input-base text-sm"
          />
        </label>
      )}

      {value.mode === 'months' && (
        <label className="space-y-1 block">
          <span className="block text-xs text-gray-500 dark:text-gray-400">En meses</span>
          <input
            type="number"
            min={1}
            max={120}
            value={value.monthsFromNow}
            onChange={event => setField({ monthsFromNow: event.target.value })}
            className="input-base text-sm"
          />
        </label>
      )}
    </div>
  );
};

// Subcomponent for debt card - Optimized with React.memo
interface DebtCardProps {
  debt: Debt;
  formatCurrency: (n: number) => string;
  showPaymentForm: string | null;
  setShowPaymentForm: (id: string | null) => void;
  paymentAmount: string;
  setPaymentAmount: (v: string) => void;
  onPayment: (id: string) => void;
  onDelete: (debt: Debt) => void;
  showBalanceModifier: string | null;
  setShowBalanceModifier: (id: string | null) => void;
  modifierAmount: string;
  setModifierAmount: (v: string) => void;
  modifierOperation: 'add' | 'subtract';
  setModifierOperation: (op: 'add' | 'subtract') => void;
  onModifyBalance: (id: string, operation: 'add' | 'subtract') => void;
  onForgive: (id: string, reason: NonNullable<Debt['forgivenReason']>) => void;
  showForgive: string | null;
  setShowForgive: (id: string | null) => void;
  showPaymentScheduleForm: string | null;
  paymentScheduleForm: PaymentScheduleFormState;
  setPaymentScheduleForm: React.Dispatch<React.SetStateAction<PaymentScheduleFormState>>;
  onOpenPaymentSchedule: (debt: Debt) => void;
  onSavePaymentSchedule: (id: string) => void;
  setShowPaymentScheduleForm: (id: string | null) => void;
}

const DebtCard: React.FC<DebtCardProps> = React.memo(({
  debt,
  formatCurrency,
  showPaymentForm,
  setShowPaymentForm,
  paymentAmount,
  setPaymentAmount,
  onPayment,
  onDelete,
  showBalanceModifier,
  setShowBalanceModifier,
  modifierAmount,
  setModifierAmount,
  modifierOperation,
  setModifierOperation,
  onModifyBalance,
  onForgive,
  showForgive,
  setShowForgive,
  showPaymentScheduleForm,
  paymentScheduleForm,
  setPaymentScheduleForm,
  onOpenPaymentSchedule,
  onSavePaymentSchedule,
  setShowPaymentScheduleForm,
}) => {
  const progress = debt.originalAmount > 0
    ? Math.round(((debt.originalAmount - debt.remainingAmount) / debt.originalAmount) * 100)
    : 0;

  const isLent = debt.type === 'lent';

  // Antigüedad y vencimiento
  const lentSource = debt.lentDate ?? debt.createdAt;
  const lentLabel = lentSource ? formatRelativeTime(ensureDate(lentSource)) : null;
  const dueDate = debt.dueDate ? ensureDate(debt.dueDate) : null;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const isDebtOverdue = !!dueDate && !debt.isSettled && dueDate < todayStart;
  const paymentInfo = getDebtNextPaymentInfo(debt, todayStart);
  const isPaymentOverdue = Boolean(paymentInfo?.isOverdue);
  const paymentLabel = paymentInfo
    ? paymentInfo.isOverdue
      ? `Pago esperado ${formatRelativeTime(paymentInfo.date)}`
      : `Próximo pago ${paymentInfo.source === 'monthly' ? 'aprox. ' : ''}${formatDate(paymentInfo.date)}`
    : null;

  return (
    <div className={`border rounded-xl p-3 bg-white dark:bg-gray-800 ${isDebtOverdue || isPaymentOverdue ? 'border-rose-300 dark:border-rose-800' : 'border-gray-200 dark:border-gray-700'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-0">
        <div className="flex-1 min-w-0">
          <div className="flex flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {debt.personName}
            </span>
            {debt.description && (
              <span className="max-w-full truncate text-xs text-gray-500 dark:text-gray-400">
                — {debt.description}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {formatCurrency(debt.remainingAmount)}
            </span>
            {debt.remainingAmount !== debt.originalAmount && (
              <span className="text-xs text-muted-foreground line-through">
                {formatCurrency(debt.originalAmount)}
              </span>
            )}
          </div>

          {/* Progress bar */}
          {progress > 0 && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{progress}% pagado</span>
                <span>Faltan {formatCurrency(debt.remainingAmount)}</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Antigüedad y vencimiento */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs">
            {lentLabel && (
              <span className="text-gray-400 dark:text-gray-500">
                {isLent ? 'Prestado' : 'Recibido'} {lentLabel}
              </span>
            )}
            {dueDate && (
              isDebtOverdue ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300">
                  <AlertTriangle size={11} />
                  Vencido {formatRelativeTime(dueDate)}
                </span>
              ) : (
                <span className="text-gray-400 dark:text-gray-500">
                  Vence el {formatDate(dueDate)}
                </span>
              )
            )}
            {paymentInfo && paymentLabel && (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium ${isPaymentOverdue
                ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                : 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
              }`}>
                {isPaymentOverdue ? <AlertTriangle size={11} /> : <CalendarClock size={11} />}
                {paymentLabel}
              </span>
            )}
            {paymentInfo?.isOneTimeOverride && paymentInfo.expectedPaymentDay && (
              <span className="text-gray-400 dark:text-gray-500">
                Luego vuelve al día {paymentInfo.expectedPaymentDay}
              </span>
            )}
          </div>
        </div>

        <div className="flex w-full items-center justify-end gap-1 border-t border-gray-100 pt-2 dark:border-gray-700 sm:ml-2 sm:w-auto sm:border-t-0 sm:pt-0">
          <button
            onClick={() => onOpenPaymentSchedule(debt)}
            className="p-1.5 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-900/30 text-sky-600 dark:text-sky-400"
            title="Próximo pago"
          >
            <CalendarClock size={16} />
          </button>
          <button
            onClick={() => {
              if (showBalanceModifier === debt.id) {
                setShowBalanceModifier(null);
              } else {
                setShowBalanceModifier(debt.id!);
                setModifierAmount('');
                setModifierOperation('add');
                setShowPaymentScheduleForm(null);
              }
            }}
            className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/30 text-purple-600 dark:text-purple-400"
            title="Modificar saldo"
          >
            <EditIcon size={16} />
          </button>
          <button
            onClick={() => {
              if (showPaymentForm === debt.id) {
                setShowPaymentForm(null);
              } else {
                setShowPaymentForm(debt.id!);
                setPaymentAmount('');
                setShowPaymentScheduleForm(null);
              }
            }}
            className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400"
            title="Registrar pago"
          >
            <DollarSign size={16} />
          </button>
          <button
            onClick={() => setShowForgive(showForgive === debt.id ? null : debt.id!)}
            className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400"
            title="Condonar"
          >
            <Ban size={16} />
          </button>
          <button
            onClick={() => onDelete(debt)}
            className="p-1.5 rounded-lg hover:bg-destructive-muted text-destructive"
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Payment schedule form */}
      {showPaymentScheduleForm === debt.id && (
        <div className="mt-3 space-y-3 rounded-lg border border-border bg-muted p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Próximo pago
            </span>
            <button
              onClick={() => setShowPaymentScheduleForm(null)}
              className="p-1 text-gray-400 hover:text-gray-600"
              title="Cerrar"
            >
              <X size={16} />
            </button>
          </div>
          <PaymentScheduleFields
            value={paymentScheduleForm}
            onChange={setPaymentScheduleForm}
          />
          <button
            onClick={() => onSavePaymentSchedule(debt.id!)}
            className="btn-submit w-full text-sm"
          >
            Guardar fecha
          </button>
        </div>
      )}

      {/* Payment form */}
      {showPaymentForm === debt.id && (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={formatNumberForInput(paymentAmount)}
            onChange={e => setPaymentAmount(unformatNumber(e.target.value))}
            placeholder="Monto del pago"
            className="input-base min-w-0 text-sm"
            autoFocus
          />
          <button
            onClick={() => onPayment(debt.id!)}
            className="btn-submit text-sm px-3"
          >
            Pagar
          </button>
          <button
            onClick={() => setShowPaymentForm(null)}
            className="p-2 text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Balance modifier form */}
      {showBalanceModifier === debt.id && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => setModifierOperation('add')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${modifierOperation === 'add'
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
            >
              Agregar
            </button>
            <button
              onClick={() => setModifierOperation('subtract')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${modifierOperation === 'subtract'
                ? 'bg-red-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
            >
              Restar
            </button>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={formatNumberForInput(modifierAmount)}
              onChange={e => setModifierAmount(unformatNumber(e.target.value))}
              placeholder="Monto"
              className="input-base min-w-0 text-sm"
              autoFocus
            />
            <button
              onClick={() => onModifyBalance(debt.id!, modifierOperation)}
              className="btn-submit text-sm px-3"
            >
              Aplicar
            </button>
            <button
              onClick={() => setShowBalanceModifier(null)}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Condonar: elige motivo. Marca la deuda saldada con motivo, sin mover dinero. */}
      {showForgive === debt.id && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Condonar deuda — el saldo pendiente se da por cerrado. Elige el motivo:
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {(['unpaid', 'gift', 'other'] as const).map((reason) => (
              <button
                key={reason}
                onClick={() => onForgive(debt.id!, reason)}
                className="flex-1 min-w-[88px] py-2 px-3 rounded-lg text-sm font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
              >
                {FORGIVEN_LABELS[reason]}
              </button>
            ))}
            <button
              onClick={() => setShowForgive(null)}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

DebtCard.displayName = 'DebtCard';
