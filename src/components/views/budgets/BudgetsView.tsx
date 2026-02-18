'use client';

import React, { useState } from 'react';
import { Plus, PieChart, AlertTriangle, CheckCircle2, XCircle, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { useFinance } from '../../../contexts/FinanceContext';
import { formatNumberForInput, unformatNumber } from '../../../utils/formatters';
import { showToast } from '../../../utils/toastHelpers';

/**
 * Vista de presupuestos mensuales por categoría
 * Permite definir límites de gasto y monitorear el progreso
 */
export const BudgetsView: React.FC = () => {
  const {
    budgets,
    categories,
    addBudget,
    updateBudget,
    deleteBudget,
    budgetStatuses,
    budgetStats,
    formatCurrency,
    hideBalances,
    setHideBalances,
  } = useFinance();

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    category: '',
    monthlyLimit: '',
  });

  // Categories that don't have a budget yet
  const availableCategories = categories.expense.filter(
    cat => !budgets.some(b => b.category === cat)
  );

  const handleSubmit = async () => {
    const limit = parseFloat(unformatNumber(formData.monthlyLimit));
    if (!formData.category) {
      showToast.error('Selecciona una categoría');
      return;
    }
    if (isNaN(limit) || limit <= 0) {
      showToast.error('El límite debe ser mayor a 0');
      return;
    }

    await addBudget({
      category: formData.category,
      monthlyLimit: limit,
      isActive: true,
    });

    showToast.success('Presupuesto creado');
    setFormData({ category: '', monthlyLimit: '' });
    setShowForm(false);
  };

  const handleDelete = async (id: string, category: string) => {
    if (!confirm(`¿Eliminar presupuesto de "${category}"?`)) return;
    await deleteBudget(id);
    showToast.success('Presupuesto eliminado');
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    await updateBudget(id, { isActive: !isActive });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'exceeded': return 'red';
      case 'warning': return 'amber';
      default: return 'green';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'exceeded': return <XCircle size={16} className="text-red-500" />;
      case 'warning': return <AlertTriangle size={16} className="text-amber-500" />;
      default: return <CheckCircle2 size={16} className="text-green-500" />;
    }
  };

  const displayAmount = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);

  return (
    <div className="space-y-6">
      {/* Header con descripción */}
      <div className="card">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Presupuestos del Mes
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Define límites de gasto por categoría
          </p>
        </div>

        {/* Stats Cards - Mejoradas */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20 rounded-2xl p-4 sm:p-5 border-2 border-purple-200 dark:border-purple-700 shadow-lg hover:shadow-xl transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-purple-200 dark:bg-purple-800 rounded-xl">
                <PieChart className="text-purple-700 dark:text-purple-300" size={20} />
              </div>
            </div>
            <p className="text-xs text-purple-700 dark:text-purple-400 font-medium mb-1">Activos</p>
            <p className="text-2xl sm:text-3xl font-bold text-purple-900 dark:text-purple-100">{budgetStats.active}</p>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 rounded-2xl p-4 sm:p-5 border-2 border-blue-200 dark:border-blue-700 shadow-lg hover:shadow-xl transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-blue-200 dark:bg-blue-800 rounded-xl">
                <PieChart className="text-blue-700 dark:text-blue-300" size={20} />
              </div>
            </div>
            <p className="text-xs text-blue-700 dark:text-blue-400 font-medium mb-1">Presupuestado</p>
            <p className="text-xl sm:text-2xl font-bold text-blue-900 dark:text-blue-100">{displayAmount(budgetStats.totalBudgeted)}</p>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 rounded-2xl p-4 sm:p-5 border-2 border-green-200 dark:border-green-700 shadow-lg hover:shadow-xl transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-green-200 dark:bg-green-800 rounded-xl">
                <CheckCircle2 className="text-green-700 dark:text-green-300" size={20} />
              </div>
            </div>
            <p className="text-xs text-green-700 dark:text-green-400 font-medium mb-1">Gastado</p>
            <p className="text-xl sm:text-2xl font-bold text-green-900 dark:text-green-100">{displayAmount(budgetStats.totalSpent)}</p>
          </div>

          <div className={`rounded-2xl p-4 sm:p-5 border-2 shadow-lg hover:shadow-xl transition-all ${budgetStats.exceeded > 0 ? 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/20 border-red-200 dark:border-red-700' : 'bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-700/30 border-gray-200 dark:border-gray-700'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className={`p-2 rounded-xl ${budgetStats.exceeded > 0 ? 'bg-red-200 dark:bg-red-800' : 'bg-gray-200 dark:bg-gray-700'}`}>
                <XCircle className={budgetStats.exceeded > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-600 dark:text-gray-400'} size={20} />
              </div>
            </div>
            <p className="text-xs text-gray-700 dark:text-gray-400 font-medium mb-1">Excedidos</p>
            <p className={`text-2xl sm:text-3xl font-bold ${budgetStats.exceeded > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-600 dark:text-gray-400'}`}>
              {budgetStats.exceeded}
            </p>
          </div>
        </div>
      </div>

      {/* Main Card */}
      <div className="card">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Mis Presupuestos
          </h3>
          {availableCategories.length > 0 && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="btn-submit text-sm flex items-center gap-2 shadow-lg hover:shadow-xl transition-all"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Nuevo</span>
            </button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 mb-4 space-y-3">
            <select
              value={formData.category}
              onChange={e => setFormData(f => ({ ...f, category: e.target.value }))}
              className="input-base"
            >
              <option value="">Seleccionar categoría...</option>
              {availableCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <input
              type="text"
              inputMode="numeric"
              value={formatNumberForInput(formData.monthlyLimit)}
              onChange={e => setFormData(f => ({ ...f, monthlyLimit: unformatNumber(e.target.value) }))}
              placeholder="Límite mensual (COP)"
              className="input-base"
            />

            <div className="flex gap-2">
              <button onClick={handleSubmit} className="btn-submit flex-1">
                Crear Presupuesto
              </button>
              <button onClick={() => setShowForm(false)} className="btn-cancel flex-1">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Budget list */}
        {budgetStatuses.length > 0 ? (
          <div className="space-y-3">
            {budgetStatuses.map(({ budget, spent, remaining, percentage, status }) => {
              const color = getStatusColor(status);
              return (
                <div
                  key={budget.id}
                  className="border rounded-xl p-3 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(status)}
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {budget.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggle(budget.id!, budget.isActive)}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title={budget.isActive ? 'Desactivar' : 'Activar'}
                      >
                        {budget.isActive
                          ? <ToggleRight size={18} className="text-purple-500" />
                          : <ToggleLeft size={18} />
                        }
                      </button>
                      <button
                        onClick={() => handleDelete(budget.id!, budget.category)}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <span>{displayAmount(spent)} gastado</span>
                    <span>{displayAmount(remaining)} disponible</span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-500 ${status === 'exceeded'
                        ? 'bg-red-500'
                        : status === 'warning'
                          ? 'bg-amber-500'
                          : 'bg-green-500'
                        }`}
                      style={{ width: `${Math.min(100, percentage)}%` }}
                    />
                  </div>

                  <div className="flex justify-between mt-1">
                    <span className={`text-xs font-medium ${status === 'exceeded'
                      ? 'text-red-600 dark:text-red-400'
                      : status === 'warning'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-green-600 dark:text-green-400'
                      }`}>
                      {percentage}%
                    </span>
                    <span className="text-xs text-gray-500">
                      Límite: {displayAmount(budget.monthlyLimit)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          !showForm && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <PieChart size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay presupuestos configurados</p>
              <p className="text-xs mt-1">Define límites de gasto por categoría</p>
            </div>
          )
        )}
      </div>
    </div >
  );
};
