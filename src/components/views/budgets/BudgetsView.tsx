'use client';

import React, { useState, useCallback } from 'react';
import { Plus, PieChart, CheckCircle2, XCircle, Trash2, ToggleLeft, ToggleRight, Sparkles, TrendingUp, TrendingDown, Minus, Target, Settings2, ArrowRight } from 'lucide-react';
import { useFinance } from '../../../contexts/FinanceContext';
import { useUIPreferences } from '../../../contexts/UIPreferencesContext';
import { formatNumberForInput, unformatNumber } from '../../../utils/formatters';
import { showToast } from '../../../utils/toastHelpers';
import { useFinancialPlan, type PlanConfig } from '../../../hooks/useFinancialPlan';
import { isGeminiConfigured } from '../../../lib/gemini';
import { FinancialPlanAI } from './components/FinancialPlanAI';

export const BudgetsView: React.FC = () => {
  const {
    budgets, categories, transactions,
    addBudget, updateBudget, deleteBudget,
    budgetStatuses, budgetStats, formatCurrency,
  } = useFinance();
  const { hideBalances } = useUIPreferences();

  // Plan config en sesión (no se persiste)
  const [planConfig, setPlanConfig] = useState<PlanConfig | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [setupForm, setSetupForm] = useState({ startMonth: new Date().toISOString().slice(0, 7), income: '' });

  // Presupuestos
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ category: '', monthlyLimit: '' });

  const plan = useFinancialPlan(transactions, planConfig);

  const availableCategories = categories.expense.filter(
    cat => !budgets.some(b => b.category === cat)
  );

  const displayAmount = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);

  const handleSetupSubmit = () => {
    const income = parseFloat(unformatNumber(setupForm.income));
    if (isNaN(income) || income <= 0) { showToast.error('Ingresa tu ingreso mensual'); return; }
    setPlanConfig({ startMonth: setupForm.startMonth, declaredIncome: income });
    setShowSetup(false);
  };

  const handleBudgetSubmit = async () => {
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'exceeded': return <XCircle size={16} className="text-red-500" />;
      case 'warning': return <PieChart size={16} className="text-amber-500" />;
      default: return <CheckCircle2 size={16} className="text-green-500" />;
    }
  };

  const trendIcon = plan?.trend === 'improving' ? <TrendingUp size={14} className="text-green-500" />
    : plan?.trend === 'declining' ? <TrendingDown size={14} className="text-red-500" />
    : <Minus size={14} className="text-gray-400" />;

  const scoreColor = (score: number) =>
    score >= 80 ? 'text-green-600 dark:text-green-400' :
    score >= 60 ? 'text-blue-600 dark:text-blue-400' :
    score >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';

  const scoreRingColor = (score: number) =>
    score >= 80 ? 'stroke-green-500' : score >= 60 ? 'stroke-blue-500' : score >= 40 ? 'stroke-amber-500' : 'stroke-red-500';

  return (
    <div className="space-y-4">
      {/* ===== PLAN FINANCIERO ===== */}
      {!planConfig ? (
        /* Setup card */
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900/30">
              <Target size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Plan Financiero</h2>
              <p className="text-xs text-gray-500">Configura tu plan para ver score, proyección y análisis</p>
            </div>
          </div>

          {!showSetup ? (
            <button onClick={() => setShowSetup(true)} className="btn-primary w-full justify-center">
              <Sparkles size={16} /> Iniciar plan financiero
            </button>
          ) : (
            <div className="space-y-3 p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-200 dark:border-purple-800">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Tu ingreso no se guarda — solo se usa en esta sesión para calcular el plan.
              </p>
              <div>
                <label className="label-base">¿Desde qué mes analizar?</label>
                <input
                  type="month"
                  value={setupForm.startMonth}
                  onChange={e => setSetupForm(f => ({ ...f, startMonth: e.target.value }))}
                  className="input-base"
                />
              </div>
              <div>
                <label className="label-base">Ingreso mensual (aprox)</label>
                <input
                  type="text" inputMode="numeric"
                  value={formatNumberForInput(setupForm.income)}
                  onChange={e => setSetupForm(f => ({ ...f, income: unformatNumber(e.target.value) }))}
                  placeholder="Ej: 4.000.000"
                  className="input-base"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSetupSubmit} className="btn-submit flex-1">Iniciar</button>
                <button onClick={() => setShowSetup(false)} className="btn-cancel flex-1">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      ) : plan ? (
        <>
          {/* Score + Resumen */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className={scoreColor(plan.score.total)} />
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Plan Financiero</h2>
                {trendIcon}
              </div>
              <button onClick={() => { setPlanConfig(null); setShowSetup(false); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <Settings2 size={16} />
              </button>
            </div>

            {/* Score circular + métricas */}
            <div className="flex items-center gap-6">
              {/* Circular score */}
              <div className="relative shrink-0">
                <svg className="w-20 h-20 -rotate-90">
                  <circle cx="40" cy="40" r="32" fill="none" strokeWidth="6" className="stroke-gray-200 dark:stroke-gray-700" />
                  <circle cx="40" cy="40" r="32" fill="none" strokeWidth="6" strokeLinecap="round"
                    className={scoreRingColor(plan.score.total)}
                    strokeDasharray={`${(plan.score.total / 100) * 201} 201`} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-xl font-bold ${scoreColor(plan.score.total)}`}>{plan.score.total}</span>
                  <span className="text-[9px] text-gray-400">/ 100</span>
                </div>
              </div>

              {/* Score breakdown */}
              <div className="flex-1 grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Ahorro</span><span className="font-medium">{plan.score.breakdown.savingsRate}/30</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Consistencia</span><span className="font-medium">{plan.score.breakdown.consistency}/25</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Necesidades</span><span className="font-medium">{plan.score.breakdown.needsRatio}/25</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Control gastos</span><span className="font-medium">{plan.score.breakdown.debtControl}/20</span></div>
              </div>
            </div>
          </div>

          {/* 50/30/20 */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Distribución promedio</h3>
            <div className="space-y-2.5">
              {[
                { label: 'Necesidades', pct: plan.rule503020.needsPct, target: 50, amount: plan.rule503020.needs, color: plan.rule503020.needsPct > 55 ? 'bg-red-500' : 'bg-blue-500' },
                { label: 'Gustos', pct: plan.rule503020.wantsPct, target: 30, amount: plan.rule503020.wants, color: plan.rule503020.wantsPct > 35 ? 'bg-amber-500' : 'bg-purple-500' },
                { label: 'Ahorro', pct: Math.max(0, plan.rule503020.savingsPct), target: 20, amount: Math.max(0, plan.rule503020.savings), color: plan.rule503020.savingsPct < 10 ? 'bg-red-500' : 'bg-green-500' },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600 dark:text-gray-400">{item.label} <span className="font-semibold">{item.pct}%</span> <span className="text-gray-400">/ {item.target}%</span></span>
                    <span className="text-gray-500">{displayAmount(item.amount)}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${item.color}`} style={{ width: `${Math.min(100, (item.pct / item.target) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Proyección de ahorro */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Proyección de ahorro</h3>
            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              <div className="p-2.5 rounded-xl bg-green-50 dark:bg-green-900/20">
                <p className="text-sm font-bold text-green-700 dark:text-green-300">{displayAmount(plan.projection.in3Months)}</p>
                <p className="text-[10px] text-green-600 dark:text-green-400">3 meses</p>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20">
                <p className="text-sm font-bold text-blue-700 dark:text-blue-300">{displayAmount(plan.projection.in6Months)}</p>
                <p className="text-[10px] text-blue-600 dark:text-blue-400">6 meses</p>
              </div>
              <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-900/20">
                <p className="text-sm font-bold text-purple-700 dark:text-purple-300">{displayAmount(plan.projection.in12Months)}</p>
                <p className="text-[10px] text-purple-600 dark:text-purple-400">12 meses</p>
              </div>
            </div>
            {plan.projection.monthsToEmergencyFund !== null && (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                🛡️ Fondo de emergencia (3 meses de gastos): <span className="font-medium">{plan.projection.monthsToEmergencyFund} meses</span>
              </p>
            )}
          </div>

          {/* Histórico mensual */}
          {plan.months.length > 1 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Histórico</h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {[...plan.months].reverse().map(m => (
                  <div key={m.key} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-14">{m.label}</span>
                    <div className="flex-1 mx-3">
                      <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${m.savingsRate >= 20 ? 'bg-green-500' : m.savingsRate >= 0 ? 'bg-blue-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(100, Math.max(0, m.savingsRate + 10))}%` }}
                        />
                      </div>
                    </div>
                    <span className={`text-xs font-semibold w-10 text-right ${m.savingsRate >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {m.savingsRate}%
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-2 px-2">
                <span>Promedio: {displayAmount(plan.avgMonthlySavings)}/mes</span>
                <span>Gasto promedio: {displayAmount(plan.avgMonthlyExpenses)}/mes</span>
              </div>
            </div>
          )}

          {/* Consejos IA */}
          {isGeminiConfigured() && (
            <FinancialPlanAI plan={plan} config={planConfig} />
          )}
        </>
      ) : (
        <div className="card text-center py-6">
          <p className="text-sm text-gray-500">No hay suficientes datos para generar el plan.</p>
          <button onClick={() => setPlanConfig(null)} className="text-xs text-purple-600 mt-2 hover:underline">Reconfigurar</button>
        </div>
      )}

      {/* ===== PRESUPUESTOS ===== */}
      <div className="card">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Presupuestos</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Límites de gasto por categoría</p>
          </div>
          {availableCategories.length > 0 && (
            <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
              <Plus size={16} /> Nuevo
            </button>
          )}
        </div>

        {/* Stats inline */}
        {budgetStats.active > 0 && (
          <div className="grid grid-cols-4 gap-2 text-center mb-4">
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
        )}
      </div>

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
              <button onClick={handleBudgetSubmit} className="btn-submit flex-1">Crear</button>
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
