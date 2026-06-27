'use client';

import React, { useState } from 'react';
import { Plus, PieChart, CheckCircle2, XCircle, Trash2, ToggleLeft, ToggleRight, Sparkles, TrendingUp, TrendingDown, Minus, Target, X, Shield, Clock, Zap, ChevronDown, ChevronUp, AlertTriangle, PiggyBank, BarChart3, Home } from 'lucide-react';
import { useBudgetsDomain, useCategoryDomain, useTransactionDomain } from '../../../hooks/useFinanceSelectors';
import { useUIPreferences } from '../../../contexts/UIPreferencesContext';
import { useAuth } from '../../../hooks/useAuth';
import { usePlanConfig } from '../../../hooks/usePlanConfig';
import { formatCurrency, formatNumberForInput, unformatNumber, parseCurrency } from '../../../utils/formatters';
import { showToast } from '../../../utils/toastHelpers';
import { useFinancialPlan, type PlanConfig } from '../../../hooks/useFinancialPlan';
import { isGeminiConfigured } from '../../../lib/gemini';
import { useBudgetRecommendations } from '../../../hooks/useBudgetRecommendations';
import { FinancialPlanAI } from './components/FinancialPlanAI';
import { ConfirmDialog } from '../../modals/ConfirmDialog';

export const BudgetsView: React.FC = () => {
  const { budgets, addBudget, updateBudget, deleteBudget, budgetStatuses, budgetStats } = useBudgetsDomain();
  const { categories } = useCategoryDomain();
  const { transactions } = useTransactionDomain();
  const { hideBalances } = useUIPreferences();
  const { user } = useAuth();

  // Plan config persistido en Firestore (o localStorage para guest)
  const { config: planConfig, loading: planLoading, saveConfig, clearConfig } = usePlanConfig(user?.uid ?? null);
  const [showSetup, setShowSetup] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [planMinimized, setPlanMinimized] = useState(false);
  const [setupForm, setSetupForm] = useState({ startMonth: new Date().toISOString().slice(0, 7), income: '' });

  // Presupuestos
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ category: '', monthlyLimit: '' });
  const [budgetToDelete, setBudgetToDelete] = useState<{ id: string; category: string } | null>(null);

  const plan = useFinancialPlan(transactions, planConfig);

  const availableCategories = categories.expense.filter(
    cat => !budgets.some(b => b.category === cat)
  );

  // Recomendaciones de presupuesto basadas en el gasto del mes anterior
  const budgetAnalysis = useBudgetRecommendations(transactions, budgets);
  const selectedRecommendation = formData.category
    ? budgetAnalysis?.recommendations.find(r => r.category === formData.category)
    : undefined;

  const displayAmount = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);

  const handleSetupSubmit = async () => {
    const income = parseCurrency(setupForm.income);
    if (isNaN(income) || income <= 0) { showToast.error('Ingresa tu ingreso mensual'); return; }
    await saveConfig({ startMonth: setupForm.startMonth, declaredIncome: income });
    setShowSetup(false);
    setShowCloseConfirm(false);
    showToast.success('Plan financiero iniciado');
  };

  const handleClosePlan = async () => {
    await clearConfig();
    setShowCloseConfirm(false);
    setShowSetup(false);
    showToast.success('Plan financiero cerrado');
  };

  const handleBudgetSubmit = async () => {
    const limit = parseCurrency(formData.monthlyLimit);
    if (!formData.category) { showToast.error('Selecciona una categoría'); return; }
    if (isNaN(limit) || limit <= 0) { showToast.error('El límite debe ser mayor a 0'); return; }
    await addBudget({ category: formData.category, monthlyLimit: limit, isActive: true });
    showToast.success('Presupuesto creado');
    setFormData({ category: '', monthlyLimit: '' });
    setShowForm(false);
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

  // Score helpers — el color codifica un estado real (calidad del score)
  const scoreColor = (s: number) => s >= 80 ? 'text-success' : s >= 60 ? 'text-info' : s >= 40 ? 'text-warning' : 'text-destructive';
  const scoreStroke = (s: number) => s >= 80 ? 'stroke-success' : s >= 60 ? 'stroke-info' : s >= 40 ? 'stroke-warning' : 'stroke-destructive';
  const levelLabel = (l: string) => l === 'excelente' ? 'Excelente' : l === 'bueno' ? 'Bueno' : l === 'regular' ? 'Regular' : 'Crítico';

  const trendLabel = plan?.trend === 'improving' ? 'Mejorando' : plan?.trend === 'declining' ? 'Empeorando' : 'Estable';
  const TrendIcon = plan?.trend === 'improving' ? TrendingUp : plan?.trend === 'declining' ? TrendingDown : Minus;
  const trendColor = plan?.trend === 'improving' ? 'text-success' : plan?.trend === 'declining' ? 'text-destructive' : 'text-muted-foreground';

  return (
    <div className="space-y-4">
      {/* ===== PLAN FINANCIERO ===== */}
      {!planConfig ? (
        <div className="card">
          <div className="text-center py-6">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Target size={28} className="text-primary" />
            </div>
            <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100">Plan financiero</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-sm mx-auto leading-relaxed">
              Analiza tus hábitos, obtén un score personalizado y proyecta tu ahorro con IA
            </p>

            {!showSetup ? (
              <button onClick={() => setShowSetup(true)} className="btn-primary mt-5 mx-auto">
                <Sparkles size={18} /> Iniciar plan
              </button>
            ) : (
              <div className="mt-5 max-w-sm mx-auto space-y-3 text-left p-5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 justify-center mb-1">
                  <Shield size={12} className="text-gray-400" />
                  Se guarda en tu cuenta para que persista entre sesiones.
                </div>
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
                <div className="flex gap-2 pt-1">
                  <button onClick={handleSetupSubmit} className="btn-submit flex-1">Iniciar</button>
                  <button onClick={() => setShowSetup(false)} className="btn-cancel flex-1">Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : plan ? (
        <>
          {/* ──── Score Card ──── */}
          <div className="card">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between">
                <button onClick={() => setPlanMinimized(!planMinimized)} className="flex items-center gap-2.5 group">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Sparkles size={14} className="text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-black text-gray-900 dark:text-gray-100">Plan financiero</h2>
                      <span className={`text-2xl font-black ${scoreColor(plan.score.total)}`}>{plan.score.total}</span>
                      <span className="text-xs text-muted-foreground">/100</span>
                      {planMinimized ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronUp size={16} className="text-gray-400" />}
                    </div>
                    <div className={`flex items-center gap-1.5 text-[11px] font-medium ${trendColor}`}>
                      <TrendIcon size={11} /> {trendLabel}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setShowCloseConfirm(true)}
                  className="p-2 text-gray-400 hover:text-destructive rounded-xl hover:bg-destructive-muted transition-colors"
                  title="Cerrar plan"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Contenido expandido */}
              {!planMinimized && (
              <>
              <div className="mt-6">
              {/* Score centrado */}
              <div className="flex flex-col items-center mb-6">
                <div className="relative mb-2">
                  <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" strokeWidth="10" className="stroke-gray-100 dark:stroke-gray-800" />
                    <circle cx="60" cy="60" r="50" fill="none" strokeWidth="10" strokeLinecap="round"
                      className={scoreStroke(plan.score.total)}
                      strokeDasharray={`${(plan.score.total / 100) * 314.16} 314.16`}
                      style={{ transition: 'stroke-dasharray 1s ease' }} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-4xl font-black leading-none ${scoreColor(plan.score.total)}`}>{plan.score.total}</span>
                    <span className="text-[11px] text-muted-foreground font-medium mt-0.5">de 100</span>
                  </div>
                </div>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{levelLabel(plan.score.level)}</span>
              </div>

              {/* Score breakdown — mini barras (color de marca; estado en texto) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Ahorro', value: plan.score.breakdown.savingsRate, max: 30, Icon: PiggyBank },
                  { label: 'Consistencia', value: plan.score.breakdown.consistency, max: 25, Icon: BarChart3 },
                  { label: 'Necesidades', value: plan.score.breakdown.needsRatio, max: 25, Icon: Home },
                  { label: 'Control', value: plan.score.breakdown.debtControl, max: 20, Icon: Target },
                ].map(item => {
                  const ratio = item.max > 0 ? item.value / item.max : 0;
                  const stateLabel = ratio >= 0.8 ? 'Bien' : ratio >= 0.5 ? 'Aceptable' : 'A mejorar';
                  return (
                  <div key={item.label} className="p-2.5 rounded-xl bg-white/60 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/50">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <item.Icon size={12} className="text-gray-400" />
                      <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${ratio * 100}%` }} />
                      </div>
                      <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">{item.value}<span className="text-muted-foreground font-normal">/{item.max}</span></span>
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1 block">{stateLabel}</span>
                  </div>
                  );
                })}
              </div>
              </div>
              </>
              )}
            </div>
          </div>

          {!planMinimized && (
          <>
          {/* ──── Distribución 50/30/20 ──── */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Distribución mensual</h3>
              <span className="text-[10px] text-muted-foreground font-medium">de {displayAmount(planConfig.declaredIncome)}</span>
            </div>
            <div className="space-y-5">
              {[
                { label: 'Necesidades', pct: plan.rule503020.needsPct, target: 50, amount: plan.rule503020.needs, targetAmount: planConfig.declaredIncome * 0.5, Icon: Home, warn: plan.rule503020.needsPct > 55 },
                { label: 'Gustos', pct: plan.rule503020.wantsPct, target: 30, amount: plan.rule503020.wants, targetAmount: planConfig.declaredIncome * 0.3, Icon: Sparkles, warn: plan.rule503020.wantsPct > 35 },
                { label: 'Ahorro', pct: Math.max(0, plan.rule503020.savingsPct), target: 20, amount: Math.max(0, plan.rule503020.savings), targetAmount: planConfig.declaredIncome * 0.2, Icon: PiggyBank, warn: plan.rule503020.savingsPct < 10 },
              ].map(item => {
                // Barra lineal 0-100%: el ancho ES el % del ingreso y la línea de
                // objetivo cae en su posición real (target%), sin escalado engañoso.
                const linearWidth = Math.min(100, Math.max(0, item.pct));
                return (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <item.Icon size={16} className="text-gray-400" />
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{item.label}</span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className={`text-lg font-black ${item.warn ? 'text-destructive' : 'text-gray-900 dark:text-gray-100'}`}>
                          {item.pct}%
                        </span>
                        <span className="text-xs text-muted-foreground">/ {item.target}%</span>
                      </div>
                    </div>
                    {/* Montos: real vs ideal */}
                    <div className="flex items-center justify-between text-[11px] mb-2 px-0.5">
                      <span className="text-gray-500 dark:text-gray-400">
                        Usas <span className={`font-bold ${item.warn ? 'text-destructive' : 'text-gray-700 dark:text-gray-300'}`}>{displayAmount(item.amount)}</span>
                      </span>
                      <span className="text-muted-foreground">
                        ideal <span className="font-bold text-gray-600 dark:text-gray-300">{displayAmount(item.targetAmount)}</span>
                      </span>
                    </div>
                    <div className="relative">
                      <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${item.warn ? 'bg-destructive' : 'bg-primary'} transition-[width] duration-700`}
                          style={{ width: `${linearWidth}%` }} />
                      </div>
                      {/* Línea del objetivo, en su posición real y etiquetada */}
                      <div className="absolute -top-0.5 bottom-0 flex flex-col items-center" style={{ left: `${item.target}%` }}>
                        <div className="w-0.5 h-4 bg-gray-500 dark:bg-gray-400 rounded-full" />
                      </div>
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground text-right pr-0.5" style={{ marginRight: `${100 - item.target}%` }}>
                      ideal {item.target}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ──── Proyección de ahorro ──── */}
          <div className="card">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4">Proyección de ahorro</h3>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { months: 3, amount: plan.projection.in3Months, icon: <Clock size={14} /> },
                { months: 6, amount: plan.projection.in6Months, icon: <TrendingUp size={14} /> },
                { months: 12, amount: plan.projection.in12Months, icon: <Zap size={14} /> },
              ].map(item => (
                <div key={item.months} className="rounded-xl p-4 text-center bg-gray-50 dark:bg-gray-800/50">
                  <div className="mx-auto mb-2 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 bg-gray-100 dark:bg-gray-700/50">
                    {item.icon}
                  </div>
                  <p className="text-sm font-black text-gray-900 dark:text-gray-100">{displayAmount(item.amount)}</p>
                  <p className="text-[10px] font-medium text-muted-foreground mt-0.5">{item.months} meses</p>
                </div>
              ))}
            </div>
            {plan.projection.monthsToEmergencyFund !== null && (
              <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-info-muted border border-info/20">
                <Shield size={14} className="text-info" />
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Fondo de emergencia en <span className="font-bold text-gray-800 dark:text-gray-200">{plan.projection.monthsToEmergencyFund} meses</span>
                </p>
              </div>
            )}
          </div>

          {/* ──── Histórico mensual ──── */}
          {plan.months.length > 1 && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Histórico</h3>
                <span className="text-[11px] text-muted-foreground font-medium">
                  Prom: {plan.avgMonthlySavings >= 0 ? '+' : ''}{displayAmount(plan.avgMonthlySavings)}/mes
                </span>
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto scrollbar-thin pr-1">
                {[...plan.months].reverse().map(m => {
                  const barWidth = Math.min(100, Math.max(5, ((m.savingsRate + 30) / 80) * 100));
                  const isPositive = m.savingsRate >= 0;
                  const isCurrent = m.key === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
                  return (
                    <div key={m.key} className={`flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors ${isCurrent ? 'bg-purple-50/50 dark:bg-purple-900/10 border border-purple-200/30 dark:border-purple-800/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'}`}>
                      <span className={`text-[11px] font-semibold w-14 shrink-0 ${isCurrent ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'}`}>
                        {m.label}{isCurrent ? ' •' : ''}
                      </span>
                      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-[width] duration-500 ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-xs font-bold ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {isPositive ? '+' : ''}{m.savingsRate}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ──── Consejos IA ──── */}
          {isGeminiConfigured() && (
            <FinancialPlanAI plan={plan} config={planConfig} />
          )}
          </>
          )}

          {/* ──── Confirmación cerrar plan ──── */}
          <ConfirmDialog
            isOpen={showCloseConfirm}
            title="¿Cerrar plan financiero?"
            message="Se eliminará tu configuración guardada. Podrás iniciar uno nuevo en cualquier momento."
            confirmLabel="Cerrar plan"
            onConfirm={handleClosePlan}
            onClose={() => setShowCloseConfirm(false)}
          />
        </>
      ) : (
        <div className="card text-center py-8">
          <p className="text-sm text-muted-foreground">No hay suficientes datos desde {planConfig.startMonth} para generar el plan.</p>
          <button onClick={() => setShowCloseConfirm(true)} className="text-xs text-purple-600 mt-2 hover:underline">Reconfigurar</button>
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

      {/* Formulario nuevo presupuesto */}
      {showForm && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Nuevo presupuesto</h3>
          <div className="space-y-3">
            <select value={formData.category} onChange={e => setFormData(f => ({ ...f, category: e.target.value }))} className="input-base">
              <option value="">Seleccionar categoría...</option>
              {availableCategories.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
            </select>

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

      {/* Confirmación eliminar presupuesto */}
      <ConfirmDialog
        isOpen={!!budgetToDelete}
        title="Eliminar presupuesto"
        message={budgetToDelete && (
          <>
            ¿Eliminar el presupuesto de{' '}
            <span className="font-semibold text-gray-900 dark:text-white">{budgetToDelete.category}</span>?
          </>
        )}
        confirmLabel="Eliminar"
        onConfirm={confirmDeleteBudget}
        onClose={() => setBudgetToDelete(null)}
      />
    </div>
  );
};
