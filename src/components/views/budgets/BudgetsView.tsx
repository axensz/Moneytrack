'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  PieChart,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useBudgetsDomain, useCategoryDomain, useTransactionDomain } from '../../../hooks/useFinanceSelectors';
import { useUIPreferences } from '../../../contexts/UIPreferencesContext';
import { UI_LABELS } from '../../../config/constants';
import { ACTION_ICONS, sectionTitle, UI_TEXT } from '../../../config/ui';
import { formatCurrency, formatNumberForInput, parseCurrency, unformatNumber } from '../../../utils/formatters';
import { showToast } from '../../../utils/toastHelpers';
import { useBudgetRecommendations } from '../../../hooks/useBudgetRecommendations';
import { ConfirmDialog } from '../../modals/ConfirmDialog';

export interface BudgetDraft {
  category: string;
  suggestedLimit: number;
}

const createEmptyBudgetForm = () => ({ category: '', monthlyLimit: '' });
const NewIcon = ACTION_ICONS.new;

interface BudgetsViewProps {
  initialDraft?: BudgetDraft | null;
  onInitialDraftApplied?: () => void;
  onOpenFinancialPlan?: () => void;
}

export const BudgetsView: React.FC<BudgetsViewProps> = ({
  initialDraft,
  onInitialDraftApplied,
  onOpenFinancialPlan,
}) => {
  const { budgets, addBudget, updateBudget, deleteBudget, budgetStatuses, budgetStats } = useBudgetsDomain();
  const { categories } = useCategoryDomain();
  const { transactions, balanceTransactions = transactions } = useTransactionDomain();
  const { hideBalances } = useUIPreferences();
  const analysisTransactions = balanceTransactions.length > 0 ? balanceTransactions : transactions;

  const [showForm, setShowForm] = useState(false);
  const [budgetsMinimized, setBudgetsMinimized] = useState(false);
  const [formData, setFormData] = useState(createEmptyBudgetForm);
  const [formErrors, setFormErrors] = useState<{ category?: string; monthlyLimit?: string }>({});
  const [budgetToDelete, setBudgetToDelete] = useState<{ id: string; category: string } | null>(null);
  const [isSubmittingBudget, setIsSubmittingBudget] = useState(false);
  const submittingBudgetRef = useRef(false);

  const availableCategories = useMemo(
    () => categories.expense.filter(cat => !budgets.some(b => b.category === cat)),
    [budgets, categories.expense],
  );

  const budgetAnalysis = useBudgetRecommendations(analysisTransactions, budgets);
  const selectedRecommendation = formData.category
    ? budgetAnalysis?.recommendations.find(r => r.category === formData.category)
    : undefined;

  const displayAmount = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);

  useEffect(() => {
    if (!initialDraft) return;

    setBudgetsMinimized(false);
    setShowForm(true);
    setFormErrors({});
    setFormData({
      category: initialDraft.category,
      monthlyLimit: String(initialDraft.suggestedLimit),
    });
    onInitialDraftApplied?.();
  }, [initialDraft, onInitialDraftApplied]);

  const handleBudgetSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingBudgetRef.current) return;

    setFormErrors({});
    const limit = parseCurrency(formData.monthlyLimit);
    if (!formData.category) {
      const message = 'Selecciona una categoría';
      setFormErrors({ category: message });
      showToast.error(message);
      return;
    }
    if (isNaN(limit) || limit <= 0) {
      const message = 'El límite debe ser mayor a 0';
      setFormErrors({ monthlyLimit: message });
      showToast.error(message);
      return;
    }
    submittingBudgetRef.current = true;
    setIsSubmittingBudget(true);
    try {
      await addBudget({ category: formData.category, monthlyLimit: limit, isActive: true });
    showToast.success('Presupuesto creado');
    setFormData(createEmptyBudgetForm());
    setFormErrors({});
    setShowForm(false);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'No se pudo guardar el presupuesto');
    } finally {
      submittingBudgetRef.current = false;
      setIsSubmittingBudget(false);
    }
  };

  const handleCancelBudgetForm = () => {
    if (isSubmittingBudget) return;
    setFormData(createEmptyBudgetForm());
    setFormErrors({});
    setShowForm(false);
  };

  const handleToggleBudgetForm = () => {
    setBudgetsMinimized(false);
    if (showForm && !budgetsMinimized) {
      handleCancelBudgetForm();
      return;
    }
    setFormErrors({});
    setShowForm(true);
  };

  const handleDelete = (id: string, category: string) => {
    setBudgetToDelete({ id, category });
  };

  const confirmDeleteBudget = async () => {
    if (!budgetToDelete) return;
    await deleteBudget(budgetToDelete.id);
    setBudgetToDelete(null);
    showToast.success('Presupuesto eliminado');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'exceeded': return <XCircle size={16} className="text-destructive" />;
      case 'warning': return <AlertTriangle size={16} className="text-warning" />;
      default: return <CheckCircle2 size={16} className="text-success" />;
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="card">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 id="view-heading-budgets" tabIndex={-1} className="text-lg font-bold text-gray-900 dark:text-gray-100">
              <button
                type="button"
                onClick={() => setBudgetsMinimized(prev => !prev)}
                aria-expanded={!budgetsMinimized}
                className="flex items-center gap-2 rounded-lg text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span>{sectionTitle('budgets')}</span>
                {budgetsMinimized ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronUp size={16} className="text-gray-400" />}
              </button>
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Límites mensuales por categoría</p>
          </div>
          {availableCategories.length > 0 && (
            <button
              type="button"
              onClick={handleToggleBudgetForm}
              className="btn-primary text-sm"
            >
              <NewIcon size={16} /> {UI_TEXT.actions.new}
            </button>
          )}
        </div>

        {!budgetsMinimized && budgetStats.active > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-900/20">
              <p className="text-lg font-bold text-purple-700 dark:text-purple-300">{budgetStats.active}</p>
              <p className="text-[10px] text-purple-600 dark:text-purple-400">Activos</p>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20">
              <p className="text-xs font-bold text-blue-700 dark:text-blue-300">{displayAmount(budgetStats.totalBudgeted)}</p>
              <p className="text-[10px] text-blue-600 dark:text-blue-400">Presupuestado</p>
            </div>
            <div className="p-2.5 rounded-xl bg-green-50 dark:bg-green-900/20">
              <p className="text-xs font-bold text-green-700 dark:text-green-300">{displayAmount(budgetStats.totalSpent)}</p>
              <p className="text-[10px] text-green-600 dark:text-green-400">Gastado</p>
            </div>
            <div className={`p-2.5 rounded-xl ${budgetStats.exceeded > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
              <p className={`text-lg font-bold ${budgetStats.exceeded > 0 ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground'}`}>{budgetStats.exceeded}</p>
              <p className="text-[10px] text-muted-foreground">Excedidos</p>
            </div>
          </div>
        )}
      </div>

      {!budgetsMinimized && (
        <>
          {showForm && (
            <form className="card" aria-labelledby="new-budget-title" onSubmit={handleBudgetSubmit} noValidate>
              <h3 id="new-budget-title" className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Nuevo presupuesto</h3>
              <div className="space-y-3">
                <div>
                  <label htmlFor="new-budget-category" className="block text-xs font-medium text-muted-foreground mb-1">Categoría</label>
                  <select
                    id="new-budget-category"
                    value={formData.category}
                    onChange={e => setFormData(f => ({ ...f, category: e.target.value }))}
                    className="input-base"
                    aria-invalid={Boolean(formErrors.category)}
                    aria-describedby={formErrors.category ? 'new-budget-category-error' : undefined}
                  >
                    <option value="">{UI_LABELS.forms.selectCategory}</option>
                    {availableCategories.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
                  </select>
                  {formErrors.category && <p id="new-budget-category-error" role="alert" className="mt-1 text-xs text-destructive">{formErrors.category}</p>}
                </div>

                {selectedRecommendation && selectedRecommendation.suggestedLimit > 0 && (
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800/50">
                    <p className="text-xs text-purple-800 dark:text-purple-200">
                      <Sparkles size={12} className="inline mr-1" />
                      Sugerencia: <strong>{formatCurrency(selectedRecommendation.suggestedLimit)}/mes</strong>
                      <span className="block text-purple-500 dark:text-purple-300/80">{selectedRecommendation.reason}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => setFormData(f => ({ ...f, monthlyLimit: String(selectedRecommendation.suggestedLimit) }))}
                      className="shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                    >
                      Usar
                    </button>
                  </div>
                )}

                <div>
                  <label htmlFor="new-budget-limit" className="block text-xs font-medium text-muted-foreground mb-1">Límite mensual</label>
                  <input
                    id="new-budget-limit"
                    type="text" inputMode="numeric"
                    value={formatNumberForInput(formData.monthlyLimit)}
                    onChange={e => setFormData(f => ({ ...f, monthlyLimit: unformatNumber(e.target.value) }))}
                    placeholder="Límite mensual" className="input-base"
                    aria-invalid={Boolean(formErrors.monthlyLimit)}
                    aria-describedby={formErrors.monthlyLimit ? 'new-budget-limit-error' : undefined}
                  />
                  {formErrors.monthlyLimit && <p id="new-budget-limit-error" role="alert" className="mt-1 text-xs text-destructive">{formErrors.monthlyLimit}</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isSubmittingBudget}
                    className="btn-submit flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmittingBudget ? UI_TEXT.states.saving : UI_TEXT.actions.create}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelBudgetForm}
                    disabled={isSubmittingBudget}
                    className="btn-cancel flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {UI_TEXT.actions.cancel}
                  </button>
                </div>
              </div>
            </form>
          )}

          {budgetStatuses.length > 0 ? (
            <div className="space-y-2">
              {budgetStatuses.map(({ budget, spent, remaining, percentage, status }) => (
                <div key={budget.id} className="card p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(status)}
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{budget.category}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label={`${budget.isActive ? 'Desactivar' : 'Activar'} presupuesto de ${budget.category}`} onClick={() => updateBudget(budget.id!, { isActive: !budget.isActive })} className="p-1 text-gray-400 hover:text-gray-600">
                        {budget.isActive ? <ToggleRight size={18} className="text-purple-500" /> : <ToggleLeft size={18} />}
                      </button>
                      <button type="button" aria-label={`Eliminar presupuesto de ${budget.category}`} onClick={() => handleDelete(budget.id!, budget.category)} className="p-1 text-gray-400 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <span>{displayAmount(spent)} gastado</span>
                    <span>{displayAmount(remaining)} disponible</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-[width] duration-500 ${status === 'exceeded' ? 'bg-red-500' : status === 'warning' ? 'bg-amber-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(100, percentage)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className={`text-xs font-medium ${status === 'exceeded' ? 'text-red-600' : status === 'warning' ? 'text-amber-600' : 'text-green-600'}`}>{percentage}%</span>
                    <span className="text-xs text-muted-foreground">Límite: {displayAmount(budget.monthlyLimit)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            !showForm && (
              <div className="card text-center py-8 text-gray-500 dark:text-gray-400">
                <PieChart size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No hay presupuestos configurados</p>
                <p className="text-xs mt-1">Define límites de gasto por categoría</p>
              </div>
            )
          )}
        </>
      )}

      {onOpenFinancialPlan && (
        <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{sectionTitle('financial-plan')}</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Score, acciones y proyección de ahorro viven en una vista propia.
              </p>
            </div>
          </div>
          <button type="button" onClick={onOpenFinancialPlan} className="btn-secondary justify-center text-sm">
            Abrir plan
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!budgetToDelete}
        title="Eliminar presupuesto"
        message={budgetToDelete && (
          <>
            ¿Eliminar el presupuesto de{' '}
            <span className="font-semibold text-gray-900 dark:text-white">{budgetToDelete.category}</span>?
          </>
        )}
        confirmLabel={UI_TEXT.actions.delete}
        onConfirm={confirmDeleteBudget}
        onClose={() => setBudgetToDelete(null)}
      />
    </div>
  );
};
