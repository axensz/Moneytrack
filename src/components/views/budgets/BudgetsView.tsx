'use client';

import React, { useState } from 'react';
import { Plus, PieChart, CheckCircle2, XCircle, Trash2, ToggleLeft, ToggleRight, Sparkles, TrendingUp, TrendingDown, Minus, Target, Settings2 } from 'lucide-react';
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

  const [planConfig, setPlanConfig] = useState<PlanConfig | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [setupForm, setSetupForm] = useState({ startMonth: new Date().toISOString().slice(0, 7), income: '' });
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

  const scoreColor = (score: number) =>
    score >= 80 ? 'text-emerald-500' : score >= 60 ? 'text-blue-500' : score >= 40 ? 'text-amber-500' : 'text-rose-500';

  const scoreGradient = (score: number) =>
    score >= 80 ? 'from-emerald-500 to-emerald-400' : score >= 60 ? 'from-blue-500 to-blue-400' : score >= 40 ? 'from-amber-500 to-amber-400' : 'from-rose-500 to-rose-400';

  const trendLabel = plan?.trend === 'improving' ? 'Mejorando' : plan?.trend === 'declining' ? 'Empeorando' : 'Estable';
  const trendColor = plan?.trend === 'improving' ? 'text-emerald-500' : plan?.trend === 'declining' ? 'text-rose-500' : 'text-gray-400';
  const TrendIcon = plan?.trend === 'improving' ? TrendingUp : plan?.trend === 'declining' ? TrendingDown : Minus;

  return (
    <div className="space-y-4">
      {/* ===== PLAN FINANCIERO ===== */}
      {!planConfig ? (
        <div className="card">
          <div className="text-center py-4">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg shadow-purple-500/20">
              <Target size={24} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Plan Financiero</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xs mx-auto">
              Score personalizado, proyección de ahorro y análisis con IA
            </p>
          </div>

          {!showSetup ? (
            <button onClick={() => setShowSetup(true)} className="btn-primary w-full justify-center mt-2">
              <Sparkles size={16} /> Iniciar plan
            </button>
          ) : (
            <div className="mt-4 space-y-3 p-4 bg-purple-50/50 dark:bg-purple-900/10 rounded-xl border border-purple-200/50 dark:border-purple-800/50">
              <p className="text-[11px] text-center text-gray-500 dark:text-gray-400">
                ⚡ Tu ingreso solo se usa en esta sesión — no se guarda.
              </p>
              <div>
                <label className="label-base">Analizar desde</label>
                <input
                  type="month"
                  value={setupForm.startMonth}
                  onChange={e => setSetupForm(f => ({ ...f, startMonth: e.target.value }))}
                  className="input-base"
                />
              </div>
              <div>
                <label className="label-base">Ingreso mensual</label>
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
          {/* Score principal */}
          <div className="card overflow-hidden">
            {/* Header con gradiente sutil */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${scoreGradient(plan.score.total)} shadow-sm`}>
                  <Sparkles size={14} className="text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Plan Financiero</h2>
                  <div className={`flex items-center gap-1 text-[11px] font-medium ${trendColor}`}>
                    <TrendIcon size={11} /> {trendLabel}
                  </div>
                </div>
              </div>
              <button onClick={() => { setPlanConfig(null); setShowSetup(false); }} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <Settings2 size={16} />
              </button>
            </div>

            {/* Score + breakdown en un layout centrado */}
            <div className="flex flex-col items-center gap-4">
              {/* Score circular grande */}
              <div className="relative">
                <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" strokeWidth="8" className="stroke-gray-100 dark:stroke-gray-800" />
                  <circle cx="50" cy="50" r="40" fill="none" strokeWidth="8" strokeLinecap="round"
                    className={`${plan.score.total >= 80 ? 'stroke-emerald-500' : plan.score.total >= 60 ? 'stroke-blue-500' : plan.score.total >= 40 ? 'stroke-amber-500' : 'stroke-rose-500'}`}
                    strokeDasharray={`${(plan.score.total / 100) * 251.3} 251.3`} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-3xl font-black ${scoreColor(plan.score.total)}`}>{plan.score.total}</span>
                  <span className="text-[10px] font-medium text-gray-400 -mt-0.5">de 100</span>
                </div>
              </div>

              {/* Breakdown horizontal */}
              <div className="w-full grid grid-cols-4 gap-1.5">
                {[
                  { label: 'Ahorro', value: plan.score.breakdown.savingsRate, max: 30, color: 'bg-emerald-500' },
                  { label: 'Consistencia', value: plan.score.breakdown.consistency, max: 25, color: 'bg-blue-500' },
                  { label: 'Necesidades', value: plan.score.breakdown.needsRatio, max: 25, color: 'bg-purple-500' },
                  { label: 'Control', value: plan.score.breakdown.debtControl, max: 20, color: 'bg-amber-500' },
                ].map(item => (
                  <div key={item.label} className="text-center">
                    <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full mb-1.5 overflow-hidden">
                      <div className={`h-full rounded-full ${item.color}`} style={{ width: `${(item.value / item.max) * 100}%` }} />
                    </div>
                    <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">{item.value}/{item.max}</span>
                    <p className="text-[9px] text-gray-400 leading-tight">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 50/30/20 + Proyección lado a lado en desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 50/30/20 */}
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Distribución</h3>
              <div className="space-y-4">
                {[
                  { label: 'Necesidades', pct: plan.rule503020.needsPct, target: 50, amount: plan.rule503020.needs, emoji: '🏠', color: 'bg-blue-500', overColor: 'bg-rose-500' },
                  { label: 'Gustos', pct: plan.rule503020.wantsPct, target: 30, amount: plan.rule503020.wants, emoji: '🎯', color: 'bg-purple-500', overColor: 'bg-amber-500' },
                  { label: 'Ahorro', pct: Math.max(0, plan.rule503020.savingsPct), target: 20, amount: Math.max(0, plan.rule503020.savings), emoji: '💰', color: 'bg-emerald-500', overColor: 'bg-emerald-500' },
                ].map(item => {
                  const isOver = item.pct > item.target * 1.1;
                  const barWidth = Math.min(100, (item.pct / (item.target * 2)) * 100); // Cap visual at 2x target
                  return (
                    <div key={item.label}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{item.emoji}</span>
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{item.label}</span>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs font-bold ${isOver && item.label !== 'Ahorro' ? 'text-rose-500' : 'text-gray-700 dark:text-gray-300'}`}>{item.pct}%</span>
                          <span className="text-[10px] text-gray-400 ml-1">/ {item.target}%</span>
                        </div>
                      </div>
                      <div className="relative w-full h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        {/* Target marker */}
                        <div className="absolute top-0 bottom-0 w-px bg-gray-300 dark:bg-gray-600 z-10" style={{ left: '50%' }} />
                        <div className={`h-full rounded-full transition-all duration-500 ${isOver && item.label !== 'Ahorro' ? item.overColor : item.color}`}
                          style={{ width: `${barWidth}%` }} />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5 text-right">{displayAmount(item.amount)}/mes</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Proyección de ahorro */}
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Proyección de ahorro</h3>
              <div className="space-y-3">
                {[
                  { label: '3 meses', amount: plan.projection.in3Months, color: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10' },
                  { label: '6 meses', amount: plan.projection.in6Months, color: 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10' },
                  { label: '12 meses', amount: plan.projection.in12Months, color: 'border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10' },
                ].map(item => (
                  <div key={item.label} className={`flex items-center justify-between p-3 rounded-xl border ${item.color}`}>
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{item.label}</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{displayAmount(item.amount)}</span>
                  </div>
                ))}
              </div>
              {plan.projection.monthsToEmergencyFund !== null && (
                <div className="mt-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 text-center">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    🛡️ Fondo de emergencia en <span className="font-bold text-gray-700 dark:text-gray-300">{plan.projection.monthsToEmergencyFund} meses</span>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Histórico mensual */}
          {plan.months.length > 1 && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Histórico mensual</h3>
                <div className="flex items-center gap-3 text-[10px] text-gray-400">
                  <span>Prom. ahorro: <span className="font-semibold text-gray-600 dark:text-gray-300">{displayAmount(plan.avgMonthlySavings)}</span></span>
                </div>
              </div>
              <div className="space-y-1 max-h-52 overflow-y-auto scrollbar-thin">
                {[...plan.months].reverse().map(m => {
                  const barWidth = Math.min(100, Math.max(0, (m.savingsRate + 20) * 1.25)); // -20% to +60% range
                  const isPositive = m.savingsRate >= 0;
                  return (
                    <div key={m.key} className="flex items-center gap-3 py-2 px-1 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 w-12 shrink-0">{m.label}</span>
                      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className={`text-[11px] font-bold w-10 text-right shrink-0 ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {m.savingsRate}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Consejos IA */}
          {isGeminiConfigured() && (
            <FinancialPlanAI plan={plan} config={planConfig} />
          )}
        </>
      ) : (
        <div className="card text-center py-8">
          <p className="text-sm text-gray-500">No hay suficientes datos para generar el plan.</p>
          <button onClick={() => setPlanConfig(null)} className="text-xs text-purple-600 mt-2 hover:underline">Reconfigurar</button>
        </div>
      )}

      {/* ===== PRESUPUESTOS ===== */}
      <div className="card">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Presupuestos</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Límites mensuales por categoría</p>
          </div>
          {availableCategories.length > 0 && (
            <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
              <Plus size={16} /> Nuevo
            </button>
          )}
        </div>

        {budgetStats.active > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-900/20">
              <p className="text-lg font-bold text-purple-700 dark:text-purple-300">{budgetStats.active}</p>
              <p className="text-[10px] text-purple-600 dark:text-purple-400">Activos</p>
            </div>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/20">
              <p className="text-xs font-bold text-blue-700 dark:text-blue-300">{displayAmount(budgetStats.totalBudgeted)}</p>
              <p className="text-[10px] text-blue-600 dark:text-blue-400">Presupuestado</p>
            </div>
            <div className="p-2 rounded-xl bg-green-50 dark:bg-green-900/20">
              <p className="text-xs font-bold text-green-700 dark:text-green-300">{displayAmount(budgetStats.totalSpent)}</p>
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
