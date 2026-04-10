'use client';

import React, { useState } from 'react';
import { Plus, PieChart, CheckCircle2, XCircle, Trash2, ToggleLeft, ToggleRight, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { useFinance } from '../../../contexts/FinanceContext';
import { useUIPreferences } from '../../../contexts/UIPreferencesContext';
import { formatNumberForInput, unformatNumber } from '../../../utils/formatters';
import { showToast } from '../../../utils/toastHelpers';
import { useBudgetRecommendations } from '../../../hooks/useBudgetRecommendations';

type PlanTab = 'overview' | 'categories' | 'tips';

export const BudgetsView: React.FC = () => {
  const {
    budgets, categories, transactions,
    addBudget, updateBudget, deleteBudget,
    budgetStatuses, budgetStats, formatCurrency,
  } = useFinance();
  const { hideBalances } = useUIPreferences();

  const [showForm, setShowForm] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [planTab, setPlanTab] = useState<PlanTab>('overview');
  const [formData, setFormData] = useState({ category: '', monthlyLimit: '' });

  const analysis = useBudgetRecommendations(transactions, budgets);

  const availableCategories = categories.expense.filter(
    cat => !budgets.some(b => b.category === cat)
  );

  const displayAmount = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);

  const handleSubmit = async () => {
    const limit = parseFloat(unformatNumber(formData.monthlyLimit));
    if (!formData.category) { showToast.error('Selecciona una categoría'); return; }
    if (isNaN(limit) || limit <= 0) { showToast.error('El límite debe ser mayor a 0'); return; }
    await addBudget({ category: formData.category, monthlyLimit: limit, isActive: true });
    showToast.success('Presupuesto creado');
    setFormData({ category: '', monthlyLimit: '' });
    setShowForm(false);
  };

  const handleDelete = async (id: string, category: string) => {
    if (!confirm(`¿Eliminar presupuesto de "${category}"?`)) return;
    await deleteBudget(id);
    showToast.success('Presupuesto eliminado');
  };

  const handleApplyRecommendation = async (category: string, limit: number) => {
    await addBudget({ category, monthlyLimit: limit, isActive: true });
    showToast.success(`Presupuesto de "${category}" creado`);
  };

  const handleApplyAll = async () => {
    if (!analysis || analysis.recommendations.length === 0) return;
    let count = 0;
    for (const rec of analysis.recommendations) {
      await addBudget({ category: rec.category, monthlyLimit: rec.suggestedLimit, isActive: true });
      count++;
    }
    showToast.success(`${count} presupuestos creados`);
    setShowPlan(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'exceeded': return <XCircle size={16} className="text-red-500" />;
      case 'warning': return <PieChart size={16} className="text-amber-500" />;
      default: return <CheckCircle2 size={16} className="text-green-500" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header compacto */}
      <div className="card">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Presupuestos</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Límites de gasto por categoría</p>
          </div>
          {availableCategories.length > 0 && (
            <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
              <Plus size={16} />
              Nuevo
            </button>
          )}
        </div>

        {/* Stats inline */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-900/20">
            <p className="text-lg font-bold text-purple-700 dark:text-purple-300">{budgetStats.active}</p>
            <p className="text-[10px] text-purple-600 dark:text-purple-400">Activos</p>
          </div>
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/20">
            <p className="text-sm font-bold text-blue-700 dark:text-blue-300">{displayAmount(budgetStats.totalBudgeted)}</p>
            <p className="text-[10px] text-blue-600 dark:text-blue-400">Presupuestado</p>
          </div>
          <div className="p-2 rounded-xl bg-green-50 dark:bg-green-900/20">
            <p className="text-sm font-bold text-green-700 dark:text-green-300">{displayAmount(budgetStats.totalSpent)}</p>
            <p className="text-[10px] text-green-600 dark:text-green-400">Gastado</p>
          </div>
          <div className={`p-2 rounded-xl ${budgetStats.exceeded > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
            <p className={`text-lg font-bold ${budgetStats.exceeded > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-500'}`}>{budgetStats.exceeded}</p>
            <p className="text-[10px] text-gray-500">Excedidos</p>
          </div>
        </div>
      </div>

      {/* Plan financiero — colapsable */}
      {analysis && analysis.recommendations.length > 0 && (
        <div className="card">
          <button onClick={() => setShowPlan(!showPlan)} className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className={
                analysis.healthLevel === 'excellent' ? 'text-green-500' :
                  analysis.healthLevel === 'good' ? 'text-blue-500' :
                    analysis.healthLevel === 'warning' ? 'text-amber-500' : 'text-red-500'
              } />
              <div className="text-left">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Plan financiero</span>
                <span className="text-xs text-gray-500 ml-2">{analysis.monthLabel}</span>
              </div>
            </div>
            {showPlan ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </button>

          {showPlan && (
            <div className="mt-4">
              {/* Tabs */}
              <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                {([
                  { key: 'overview' as PlanTab, label: 'Resumen' },
                  { key: 'categories' as PlanTab, label: `Categorías (${analysis.recommendations.length})` },
                  { key: 'tips' as PlanTab, label: 'Consejos' },
                ]).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setPlanTab(tab.key)}
                    className={`flex-1 text-xs font-medium py-2 px-3 rounded-md transition-colors ${planTab === tab.key
                      ? 'bg-white dark:bg-gray-700 text-purple-700 dark:text-purple-300 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab: Resumen */}
              {planTab === 'overview' && (
                <div className="space-y-4">
                  {/* 50/30/20 */}
                  <div className="space-y-3">
                    {[
                      { label: 'Necesidades', pct: analysis.rule503020.needsPct, target: 50, amount: analysis.rule503020.needs, barColor: analysis.rule503020.needsPct > 55 ? 'bg-red-500' : 'bg-blue-500' },
                      { label: 'Gustos', pct: analysis.rule503020.wantsPct, target: 30, amount: analysis.rule503020.wants, barColor: analysis.rule503020.wantsPct > 35 ? 'bg-amber-500' : 'bg-purple-500' },
                      { label: 'Ahorro', pct: Math.max(0, analysis.rule503020.savingsPct), target: 20, amount: Math.max(0, analysis.rule503020.savingsActual), barColor: analysis.rule503020.savingsPct < 10 ? 'bg-red-500' : 'bg-green-500' },
                    ].map(item => (
                      <div key={item.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-600 dark:text-gray-400">{item.label} <span className="font-medium">{item.pct}%</span> <span className="text-gray-400">/ {item.target}%</span></span>
                          <span className="text-gray-500">{displayAmount(item.amount)}</span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${item.barColor}`}
                            style={{ width: `${Math.min(100, (item.pct / item.target) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Método */}
                  <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                    <p className="text-xs font-semibold text-purple-900 dark:text-purple-100">📖 {analysis.method.name}</p>
                    <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">{analysis.method.howItApplies}</p>
                  </div>
                </div>
              )}

              {/* Tab: Categorías */}
              {planTab === 'categories' && (
                <div className="space-y-2">
                  {analysis.recommendations.map(rec => (
                    <div key={rec.category} className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{rec.category}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-500">{displayAmount(rec.lastMonthSpent)}</span>
                          <span className="text-xs text-gray-400">→</span>
                          <span className="text-xs font-medium text-purple-600 dark:text-purple-400">{displayAmount(rec.suggestedLimit)}</span>
                        </div>
                        <p className="text-[10px] text-gray-400">{rec.reason}</p>
                      </div>
                      <button
                        onClick={() => handleApplyRecommendation(rec.category, rec.suggestedLimit)}
                        className="ml-3 shrink-0 text-xs font-medium px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 transition-colors"
                      >
                        Aplicar
                      </button>
                    </div>
                  ))}
                  <button onClick={handleApplyAll} className="w-full py-2.5 text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors">
                    Aplicar todos ({analysis.recommendations.length})
                  </button>
                </div>
              )}

              {/* Tab: Consejos */}
              {planTab === 'tips' && (
                <div className="space-y-2">
                  {analysis.tips.map((tip, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                      <span className="text-base shrink-0">{tip.icon}</span>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{tip.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tip.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Formulario nuevo presupuesto */}
      {showForm && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Nuevo presupuesto</h3>
          <div className="space-y-3">
            <select value={formData.category} onChange={e => setFormData(f => ({ ...f, category: e.target.value }))} className="input-base">
              <option value="">Seleccionar categoría...</option>
              {availableCategories.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
            </select>
            <input
              type="text" inputMode="numeric"
              value={formatNumberForInput(formData.monthlyLimit)}
              onChange={e => setFormData(f => ({ ...f, monthlyLimit: unformatNumber(e.target.value) }))}
              placeholder="Límite mensual" className="input-base"
            />
            <div className="flex gap-2">
              <button onClick={handleSubmit} className="btn-submit flex-1">Crear</button>
              <button onClick={() => setShowForm(false)} className="btn-cancel flex-1">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de presupuestos */}
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
                  <button onClick={() => updateBudget(budget.id!, { isActive: !budget.isActive })} className="p-1 text-gray-400 hover:text-gray-600">
                    {budget.isActive ? <ToggleRight size={18} className="text-purple-500" /> : <ToggleLeft size={18} />}
                  </button>
                  <button onClick={() => handleDelete(budget.id!, budget.category)} className="p-1 text-gray-400 hover:text-red-500">
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
                  className={`h-2 rounded-full transition-all duration-500 ${status === 'exceeded' ? 'bg-red-500' : status === 'warning' ? 'bg-amber-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(100, percentage)}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className={`text-xs font-medium ${status === 'exceeded' ? 'text-red-600' : status === 'warning' ? 'text-amber-600' : 'text-green-600'}`}>{percentage}%</span>
                <span className="text-xs text-gray-500">Límite: {displayAmount(budget.monthlyLimit)}</span>
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
    </div>
  );
};
