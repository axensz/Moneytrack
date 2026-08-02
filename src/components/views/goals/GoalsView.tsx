'use client';

import React, { useRef, useState } from 'react';
import { Target, Trophy, Calendar, Trash2, DollarSign, X, Clock, CheckCircle2, Info, Lightbulb } from 'lucide-react';
import { useGoalsDomain } from '../../../hooks/useFinanceSelectors';
import { useUIPreferences } from '../../../contexts/UIPreferencesContext';
import { formatCurrency, formatNumberForInput, unformatNumber, parseCurrency, parseDateFromInput } from '../../../utils/formatters';
import { showToast } from '../../../utils/toastHelpers';
import { ConfirmDialog } from '../../modals/ConfirmDialog';
import { ACTION_ICONS, sectionTitle, UI_TEXT } from '../../../config/ui';
import type { SavingsGoal } from '../../../types/finance';

const createEmptyGoalForm = () => ({
  name: '',
  targetAmount: '',
  targetDate: '',
});
const NewIcon = ACTION_ICONS.new;

/**
 * Vista de metas de ahorro
 * Permite crear metas con montos objetivo y trackear progreso
 */
export const GoalsView: React.FC = () => {
  const {
    addGoal,
    deleteGoal,
    addSavings,
    goalStatuses,
    goalStats,
  } = useGoalsDomain();
  const { hideBalances } = useUIPreferences();

  const [showForm, setShowForm] = useState(false);
  const [showAddSavings, setShowAddSavings] = useState<string | null>(null);
  const [savingsAmount, setSavingsAmount] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [goalToDelete, setGoalToDelete] = useState<SavingsGoal | null>(null);
  const [isSubmittingGoal, setIsSubmittingGoal] = useState(false);
  const submittingGoalRef = useRef(false);

  const [formData, setFormData] = useState(createEmptyGoalForm);
  const [formErrors, setFormErrors] = useState<{ name?: string; targetAmount?: string }>({});
  const [savingsError, setSavingsError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingGoalRef.current) return;

    setFormErrors({});
    const amount = parseCurrency(formData.targetAmount);
    if (!formData.name.trim()) {
      const message = 'Ingresa un nombre para la meta';
      setFormErrors({ name: message });
      showToast.error(message);
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      const message = 'El monto objetivo debe ser mayor a 0';
      setFormErrors({ targetAmount: message });
      showToast.error(message);
      return;
    }

    submittingGoalRef.current = true;
    setIsSubmittingGoal(true);
    try {
      await addGoal({
        name: formData.name.trim(),
        targetAmount: amount,
        currentAmount: 0,
        targetDate: formData.targetDate ? parseDateFromInput(formData.targetDate) : undefined,
        isCompleted: false,
      });

      showToast.success('Meta creada');
      setFormData(createEmptyGoalForm());
      setFormErrors({});
      setShowForm(false);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'No se pudo guardar la meta');
    } finally {
      submittingGoalRef.current = false;
      setIsSubmittingGoal(false);
    }
  };

  const handleCancelGoalForm = () => {
    if (isSubmittingGoal) return;
    setFormData(createEmptyGoalForm());
    setFormErrors({});
    setShowForm(false);
  };

  const handleToggleGoalForm = () => {
    if (showForm) {
      handleCancelGoalForm();
    } else {
      setFormErrors({});
      setShowForm(true);
    }
  };

  const handleAddSavings = async (event: React.FormEvent<HTMLFormElement>, goalId: string) => {
    event.preventDefault();
    setSavingsError(null);
    const amount = parseCurrency(savingsAmount);
    if (isNaN(amount) || amount <= 0) {
      const message = 'El monto debe ser mayor a 0';
      setSavingsError(message);
      showToast.error(message);
      return;
    }

    await addSavings(goalId, amount);
    showToast.success('Ahorro registrado');
    setSavingsAmount('');
    setSavingsError(null);
    setShowAddSavings(null);
  };

  const handleDelete = (goal: SavingsGoal) => {
    setGoalToDelete(goal);
  };

  const confirmDeleteGoal = async () => {
    if (!goalToDelete) return;
    await deleteGoal(goalToDelete.id!);
    setGoalToDelete(null);
    showToast.success('Meta eliminada');
  };

  const activeGoals = goalStatuses.filter(gs => !gs.goal.isCompleted);
  const completedGoals = goalStatuses.filter(gs => gs.goal.isCompleted);

  const displayAmount = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="card">
        {/* Header con descripción */}
        <div className="mb-6">
          <h2 id="view-heading-goals" tabIndex={-1} className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {sectionTitle('goals')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Define y alcanza tus objetivos financieros
          </p>
          {/* P-goals-isolated: las metas son un seguimiento informativo aparte.
              "Agregar ahorro" solo incrementa un contador; NO descuenta dinero de
              ninguna cuenta. Se divulga para evitar que el usuario crea que el
              dinero ahorrado dejó sus saldos (se contaría doble). */}
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-info-muted border border-info/20 px-3 py-2">
            <Info size={14} className="mt-0.5 shrink-0 text-info" aria-hidden="true" />
            <p className="text-xs text-info">
              Seguimiento manual — registrar un ahorro aquí <strong>no mueve dinero</strong> de tus cuentas ni afecta tus saldos.
            </p>
          </div>
        </div>

        {/* Stats - planas y neutras (las metas son seguimiento, no estado) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="card-stat">
            <div className="flex items-center gap-2 mb-2">
              <Target className="text-gray-500 dark:text-gray-400" size={18} />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Metas activas</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">{goalStats.activeCount}</p>
          </div>
          <div className="card-stat">
            <div className="flex items-center gap-2 mb-2">
              <Target className="text-gray-500 dark:text-gray-400" size={18} />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Objetivo total</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{displayAmount(goalStats.totalTarget)}</p>
          </div>
          <div className="card-stat">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="text-gray-500 dark:text-gray-400" size={18} />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Ahorrado</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{displayAmount(goalStats.totalSaved)}</p>
          </div>
          <div className="card-stat">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="text-gray-500 dark:text-gray-400" size={18} />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Completadas</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">{goalStats.completedCount}</p>
          </div>
        </div>

        {/* Header con botón */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Mis metas
          </h3>
          <button
            type="button"
            onClick={handleToggleGoalForm}
            className="btn-primary text-sm"
          >
            <NewIcon size={16} />
            {UI_TEXT.actions.newFeminine} meta
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <form aria-labelledby="new-goal-title" onSubmit={handleSubmit} noValidate className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 mb-4 space-y-3">
            <h4 id="new-goal-title" className="sr-only">Nueva meta</h4>
            <div>
              <label htmlFor="new-goal-name" className="block text-xs font-medium text-muted-foreground mb-1">Nombre de la meta</label>
              <input
                id="new-goal-name"
                type="text"
                value={formData.name}
                onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                placeholder="Nombre de la meta (ej: Vacaciones)"
                className="input-base"
                aria-invalid={Boolean(formErrors.name)}
                aria-describedby={formErrors.name ? 'new-goal-name-error' : undefined}
              />
              {formErrors.name && <p id="new-goal-name-error" role="alert" className="mt-1 text-xs text-destructive">{formErrors.name}</p>}
            </div>

            <div>
              <label htmlFor="new-goal-amount" className="block text-xs font-medium text-muted-foreground mb-1">Monto objetivo</label>
              <input
                id="new-goal-amount"
                type="text"
                inputMode="numeric"
                value={formatNumberForInput(formData.targetAmount)}
                onChange={e => setFormData(f => ({ ...f, targetAmount: unformatNumber(e.target.value) }))}
                placeholder="Monto objetivo (COP)"
                className="input-base"
                aria-invalid={Boolean(formErrors.targetAmount)}
                aria-describedby={formErrors.targetAmount ? 'new-goal-amount-error' : undefined}
              />
              {formErrors.targetAmount && <p id="new-goal-amount-error" role="alert" className="mt-1 text-xs text-destructive">{formErrors.targetAmount}</p>}
            </div>

            <div>
              <label htmlFor="new-goal-date" className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                Fecha límite (opcional)
              </label>
              <input
                id="new-goal-date"
                type="date"
                value={formData.targetDate}
                onChange={e => setFormData(f => ({ ...f, targetDate: e.target.value }))}
                className="input-base"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSubmittingGoal}
                className="btn-submit flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingGoal ? UI_TEXT.states.saving : 'Crear meta'}
              </button>
              <button
                type="button"
                onClick={handleCancelGoalForm}
                disabled={isSubmittingGoal}
                className="btn-cancel flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {UI_TEXT.actions.cancel}
              </button>
            </div>
          </form>
        )}

        {/* Active Goals */}
        {activeGoals.length > 0 ? (
          <div className="space-y-3">
            {activeGoals.map(({ goal, percentage, remaining, suggestedMonthly, daysRemaining, isOverdue }) => (
              <div
                key={goal.id}
                className="border rounded-xl p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {goal.name}
                    </span>
                    {goal.targetDate && (
                      <div className="flex items-center gap-1 mt-0.5">
                        {isOverdue ? (
                          <Clock size={12} className="text-destructive" />
                        ) : (
                          <Calendar size={12} className="text-gray-400" />
                        )}
                        <span className={`text-xs ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                          {isOverdue
                            ? `Vencida hace ${Math.abs(daysRemaining!)} ${Math.abs(daysRemaining!) === 1 ? 'día' : 'días'}`
                            : `${daysRemaining} ${daysRemaining === 1 ? 'día restante' : 'días restantes'}`
                          }
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Agregar ahorro a ${goal.name}`}
                      onClick={() => {
                        if (showAddSavings === goal.id) {
                          setShowAddSavings(null);
                          setSavingsError(null);
                        } else {
                          setShowAddSavings(goal.id!);
                          setSavingsAmount('');
                          setSavingsError(null);
                        }
                      }}
                      className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400"
                      title="Agregar ahorro"
                    >
                      <DollarSign size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Eliminar meta ${goal.name}`}
                      onClick={() => handleDelete(goal)}
                      className="p-1.5 rounded-lg hover:bg-destructive-muted text-destructive"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Amounts */}
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {displayAmount(goal.currentAmount)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    de {displayAmount(goal.targetAmount)}
                  </span>
                </div>

                {/* Progress bar — marca mientras avanza, éxito al completar */}
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-2">
                  <div
                    className={`h-3 rounded-full transition-[width,background-color] duration-500 ${percentage >= 100 ? 'bg-success' : 'bg-primary'}`}
                    style={{ width: `${Math.min(100, percentage)}%` }}
                  />
                </div>

                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>{percentage >= 100 ? 'Completada' : `${Math.min(100, percentage)}% completado`}</span>
                  <span>Faltan {displayAmount(remaining)}</span>
                </div>

                {suggestedMonthly && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5">
                    <Lightbulb size={12} className="text-gray-400 shrink-0" />
                    Ahorra {displayAmount(suggestedMonthly)}/mes para alcanzar tu meta
                  </p>
                )}

                {/* Add savings form */}
                {showAddSavings === goal.id && (
                  <form aria-label={`Agregar ahorro a ${goal.name}`} onSubmit={event => handleAddSavings(event, goal.id!)} noValidate className="mt-3">
                    <div className="flex gap-2">
                      <label htmlFor={`goal-savings-${goal.id}`} className="sr-only">Monto a ahorrar para {goal.name}</label>
                      <input
                        id={`goal-savings-${goal.id}`}
                        type="text"
                        inputMode="numeric"
                        value={formatNumberForInput(savingsAmount)}
                        onChange={e => setSavingsAmount(unformatNumber(e.target.value))}
                        placeholder="Monto a ahorrar"
                        className="input-base flex-1 text-sm"
                        aria-invalid={Boolean(savingsError)}
                        aria-describedby={savingsError ? `goal-savings-${goal.id}-error` : undefined}
                        autoFocus
                      />
                      <button type="submit" className="btn-submit text-sm px-3">
                        Ahorrar
                      </button>
                      <button
                        type="button"
                        aria-label={`Cerrar ahorro para ${goal.name}`}
                        onClick={() => {
                          setShowAddSavings(null);
                          setSavingsAmount('');
                          setSavingsError(null);
                        }}
                        className="p-2 text-gray-400 hover:text-gray-600"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    {savingsError && <p id={`goal-savings-${goal.id}-error`} role="alert" className="mt-1 text-xs text-destructive">{savingsError}</p>}
                  </form>
                )}
                {showAddSavings === goal.id && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Solo actualiza el progreso de la meta; no descuenta de tus cuentas.
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          !showForm && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Target size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay metas de ahorro</p>
              <p className="text-xs mt-1">Crea una meta para empezar a ahorrar con propósito</p>
            </div>
          )
        )}

        {/* Completed Goals */}
        {completedGoals.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowCompleted(!showCompleted)}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {showCompleted ? 'Ocultar' : 'Mostrar'} completadas ({completedGoals.length})
            </button>
            {showCompleted && (
              <div className="mt-2 space-y-2">
                {completedGoals.map(({ goal }) => (
                  <div key={goal.id} className="flex items-center justify-between p-3 bg-success-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      <Trophy size={16} className="text-warning" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {goal.name}
                      </span>
                    </div>
                    <span className="text-sm text-success font-medium">
                      {displayAmount(goal.targetAmount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmación eliminar meta */}
      <ConfirmDialog
        isOpen={!!goalToDelete}
        title="Eliminar meta"
        message={goalToDelete && (
          <>
            ¿Eliminar la meta{' '}
            <span className="font-semibold text-gray-900 dark:text-white">{goalToDelete.name}</span>?
          </>
        )}
        confirmLabel={UI_TEXT.actions.delete}
        onConfirm={confirmDeleteGoal}
        onClose={() => setGoalToDelete(null)}
      />
    </div>
  );
};
