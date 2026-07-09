'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  Home,
  Lightbulb,
  Minus,
  PiggyBank,
  Shield,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { useAccountDomain, useBudgetsDomain, useRecurringDomain, useTransactionDomain } from '../../../hooks/useFinanceSelectors';
import { useUIPreferences } from '../../../contexts/UIPreferencesContext';
import { useAuth } from '../../../hooks/useAuth';
import { usePlanConfig } from '../../../hooks/usePlanConfig';
import { formatCurrency, formatNumberForInput, parseCurrency, unformatNumber } from '../../../utils/formatters';
import { showToast } from '../../../utils/toastHelpers';
import { useFinancialPlan } from '../../../hooks/useFinancialPlan';
import { isGeminiConfigured } from '../../../lib/gemini';
import { useBudgetRecommendations } from '../../../hooks/useBudgetRecommendations';
import { FinancialPlanAI } from './components/FinancialPlanAI';
import { PlanSkeleton } from './PlanSkeleton';
import { ConfirmDialog } from '../../modals/ConfirmDialog';
import { isRealBudgetExpense } from '../../../utils/budgetPlanning';
import { sectionTitle, UI_TEXT } from '../../../config/ui';

interface FinancialPlanViewProps {
  onUseBudgetSuggestion?: (category: string, suggestedLimit: number) => void;
}

export const FinancialPlanView: React.FC<FinancialPlanViewProps> = ({ onUseBudgetSuggestion }) => {
  const { budgets } = useBudgetsDomain();
  const { transactions, balanceTransactions = transactions } = useTransactionDomain();
  const { accounts, getAccountBalance, getCreditUsed, balancesReady } = useAccountDomain();
  const { recurringPayments } = useRecurringDomain();
  const { hideBalances } = useUIPreferences();
  const { user, loading: authLoading } = useAuth();
  const planTransactions = balanceTransactions.length > 0 ? balanceTransactions : transactions;

  // Datos vivos para el plan: saldo liquido (efectivo + ahorros, NO credito) para
  // medir el fondo de emergencia contra lo que el usuario YA tiene, y utilizacion
  // de tarjetas (used/limit). Memoizado: solo cambia con las cuentas/saldos.
  const planLiveContext = useMemo(() => {
    const liquidBalance = accounts
      .filter(a => a.type !== 'credit')
      .reduce((sum, a) => sum + getAccountBalance(a.id!), 0);
    const creditAccounts = accounts.filter(a => a.type === 'credit');
    const limit = creditAccounts.reduce((s, a) => s + (a.creditLimit || 0), 0);
    const used = creditAccounts.reduce((s, a) => s + getCreditUsed(a.id!), 0);
    return {
      liquidBalance,
      creditUtilization: limit > 0 ? { used, limit, ratio: used / limit } : null,
      recurringPayments,
    };
  }, [accounts, getAccountBalance, getCreditUsed, recurringPayments]);

  // Plan config persistido en Firestore (o localStorage para guest)
  const { config: planConfig, loading: planLoading, saveConfig, clearConfig } = usePlanConfig(user?.uid ?? null, authLoading);
  const [showSetup, setShowSetup] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [planMinimized, setPlanMinimized] = useState(false);
  const [setupForm, setSetupForm] = useState({ startMonth: new Date().toISOString().slice(0, 7), income: '' });
  const [showIncomeEditor, setShowIncomeEditor] = useState(false);
  const [incomeEdit, setIncomeEdit] = useState('');

  const plan = useFinancialPlan(planTransactions, planConfig, planLiveContext);

  const budgetAnalysis = useBudgetRecommendations(planTransactions, budgets, planConfig?.declaredIncome);
  const visibleRecommendations = budgetAnalysis?.recommendations.slice(0, 3) ?? [];
  const salaryActions = planConfig ? [
    {
      key: 'savings',
      label: 'Aparta para ahorro',
      message: 'Meta mensual del 20% de tu sueldo.',
      amount: planConfig.declaredIncome * 0.2,
    },
    {
      key: 'needs',
      label: 'Reserva para necesidades',
      message: 'Límite mensual del 50% para vivienda, salud y demás gastos esenciales.',
      amount: planConfig.declaredIncome * 0.5,
    },
    {
      key: 'wants',
      label: 'Reserva para gustos',
      message: 'Límite mensual del 30% para compras personales y otros gastos discrecionales.',
      amount: planConfig.declaredIncome * 0.3,
    },
  ] : [];

  const displayAmount = (amount: number) => hideBalances ? '\u2022\u2022\u2022\u2022\u2022\u2022' : formatCurrency(amount);
  const formatCoverageMonths = (months: number) => {
    const floored = Math.floor(months * 10) / 10;
    return floored.toLocaleString('es-CO', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  };

  const planEmptyState = useMemo(() => {
    if (!planConfig) return null;
    if (!planConfig.declaredIncome || planConfig.declaredIncome <= 0) {
      return {
        title: 'Falta configurar ingreso',
        message: 'Ingresa tu ingreso mensual neto para calcular necesidades, gustos y ahorro.',
      };
    }
    const [startYear, startMo] = planConfig.startMonth.split('-').map(Number);
    const startDate = new Date(startYear, startMo - 1, 1);
    const paidExpenses = planTransactions.filter(t => isRealBudgetExpense(t) && new Date(t.date) >= startDate);
    if (paidExpenses.length === 0) {
      return {
        title: 'Faltan gastos pagados',
        message: `Registra al menos un gasto pagado desde ${planConfig.startMonth} para calcular necesidades, gustos y ahorro real.`,
      };
    }
    return {
      title: 'No hay suficientes datos',
      message: `Revisa el mes inicial (${planConfig.startMonth}) o agrega más movimientos pagados para generar el plan.`,
    };
  }, [planConfig, planTransactions]);

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
    setShowIncomeEditor(false);
    showToast.success('Plan financiero cerrado');
  };

  const handleOpenIncomeEditor = () => {
    if (!planConfig) return;
    setIncomeEdit(String(planConfig.declaredIncome));
    setShowIncomeEditor(true);
  };

  const handleIncomeUpdate = async () => {
    if (!planConfig) return;
    const income = parseCurrency(incomeEdit);
    if (isNaN(income) || income <= 0) {
      showToast.error('Ingresa un sueldo mensual v\u00e1lido');
      return;
    }
    await saveConfig({ ...planConfig, declaredIncome: income });
    setShowIncomeEditor(false);
    showToast.success('Sueldo mensual actualizado');
  };

  const handleUseRecommendation = (category: string, suggestedLimit: number) => {
    if (!onUseBudgetSuggestion) return;
    onUseBudgetSuggestion(category, suggestedLimit);
    showToast.success('Sugerencia lista en Presupuestos');
  };

  // Score helpers: el color codifica un estado real (calidad del score)
  const scoreColor = (s: number) => s >= 80 ? 'text-success' : s >= 60 ? 'text-info' : s >= 40 ? 'text-warning' : 'text-destructive';
  const scoreStroke = (s: number) => s >= 80 ? 'stroke-success' : s >= 60 ? 'stroke-info' : s >= 40 ? 'stroke-warning' : 'stroke-destructive';
  const levelLabel = (l: string) => l === 'excelente' ? 'Excelente' : l === 'bueno' ? 'Bueno' : l === 'regular' ? 'Regular' : 'Cr\u00edtico';

  const trendLabel = plan?.trend === 'improving' ? 'Mejorando' : plan?.trend === 'declining' ? 'Empeorando' : 'Estable';
  const TrendIcon = plan?.trend === 'improving' ? TrendingUp : plan?.trend === 'declining' ? TrendingDown : Minus;
  const trendColor = plan?.trend === 'improving' ? 'text-success' : plan?.trend === 'declining' ? 'text-destructive' : 'text-muted-foreground';
  const incomeEditor = showIncomeEditor && planConfig ? (
    <form
      onSubmit={event => {
        event.preventDefault();
        void handleIncomeUpdate();
      }}
      className="mb-4 rounded-xl border border-primary/15 bg-primary/5 p-3"
    >
      <label htmlFor="financial-plan-income" className="label-base">Sueldo mensual</label>
      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
        <input
          id="financial-plan-income"
          type="text"
          inputMode="numeric"
          value={formatNumberForInput(incomeEdit)}
          onChange={event => setIncomeEdit(unformatNumber(event.target.value))}
          className="input-base flex-1"
          aria-label="Sueldo mensual"
        />
        <div className="flex gap-2 sm:shrink-0">
          <button type="submit" className="btn-submit flex-1 sm:flex-none">Guardar</button>
          <button type="button" onClick={() => setShowIncomeEditor(false)} className="btn-cancel flex-1 sm:flex-none">
            {UI_TEXT.actions.cancel}
          </button>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Las metas y sugerencias se recalcular\u00e1n con este sueldo.</p>
    </form>
  ) : null;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* ===== PLAN FINANCIERO ===== */}
      {(planLoading || !balancesReady) ? (
        // Skeleton mientras (a) carga la config del plan y (b) los saldos asientan.
        // Sin (b), el fondo de emergencia se calcularía con saldo líquido ~0 y
        // mostraría un falso "sin fondo" rojo que se autocorrige al asentar (clase
        // de bug saldos-paginados). Evita además el parpadeo "Iniciar plan" → plan.
        // Mismo componente que el fallback del Suspense → un solo skeleton continuo.
        <PlanSkeleton />
      ) : (
        // Resuelto (auth + config + saldos): el contenido entra con un fade suave
        // en vez de saltar del skeleton de golpe. ponytail: CSS-only, sin lib.
        <div className="space-y-4 animate-in fade-in duration-300">
        {!planConfig ? (
        <div className="card">
          <div className="text-center py-4 sm:py-6">
            <div className="mx-auto mb-3 sm:mb-4 flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Target size={24} className="text-primary" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-gray-100">{sectionTitle('financial-plan')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 sm:mt-2 max-w-sm mx-auto leading-relaxed">
              Analiza tus hábitos, obtén un score personalizado y proyecta tu ahorro con IA
            </p>

            {!showSetup ? (
              <button onClick={() => setShowSetup(true)} className="btn-primary mt-4 sm:mt-5 mx-auto">
                <Sparkles size={18} /> Iniciar plan
              </button>
            ) : (
              <div className="mt-4 sm:mt-5 max-w-sm mx-auto space-y-3 text-left p-4 sm:p-5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700">
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
                  <button onClick={() => setShowSetup(false)} className="btn-cancel flex-1">{UI_TEXT.actions.cancel}</button>
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
                <button
                  type="button"
                  onClick={() => setPlanMinimized(prev => !prev)}
                  aria-expanded={!planMinimized}
                  className="flex items-center gap-2.5 group"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Sparkles size={14} className="text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-black text-gray-900 dark:text-gray-100">{sectionTitle('financial-plan')}</h2>
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
                  aria-label="Cerrar plan"
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
              {/* Prioridad accionable: antes del score para que el plan diga qué hacer. */}
              {plan.actionItems.length > 0 && (
                <div className="mb-5 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Lightbulb size={16} className="text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-primary uppercase tracking-wide">Tu prioridad este mes</p>
                    <p className="text-sm font-black text-gray-900 dark:text-gray-100 mt-0.5">{plan.actionItems[0].label}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                      {plan.actionItems[0].category ? 'Ajusta' : 'Aparta'}{' '}
                      <span className="font-bold text-gray-900 dark:text-gray-100">{displayAmount(plan.actionItems[0].amount)}</span>
                      {plan.actionItems[0].category ? ` en ${plan.actionItems[0].category}` : ''}. {plan.actionItems[0].message}
                    </p>
                  </div>
                </div>
              )}

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

              {/* Siguiente paso accionable: la dimensión más floja del score → un "haz X". */}
              {plan.nextStep && (
                <div className="mt-5 flex items-start gap-2.5 p-3 rounded-xl bg-primary/5 border border-primary/15">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Lightbulb size={14} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-primary uppercase tracking-wide">Siguiente paso</p>
                    <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 leading-relaxed">{plan.nextStep.message}</p>
                  </div>
                </div>
              )}
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
              <div className="flex items-center gap-2 text-right">
                <span className="text-[10px] text-muted-foreground font-medium">
                  de {displayAmount(planConfig.declaredIncome)} · {plan.analysisLabel}
                </span>
                <button
                  type="button"
                  onClick={handleOpenIncomeEditor}
                  className="text-[11px] font-semibold text-primary hover:underline"
                >
                  Editar sueldo
                </button>
              </div>
            </div>
            {incomeEditor}
            <div className="space-y-5">
              {[
                { label: 'Necesidades', pct: plan.rule503020.needsPct, target: 50, amount: plan.rule503020.needs, targetAmount: plan.needsGap.target, gap: plan.needsGap, Icon: Home },
                { label: 'Gustos', pct: plan.rule503020.wantsPct, target: 30, amount: plan.rule503020.wants, targetAmount: plan.wantsGap.target, gap: plan.wantsGap, Icon: Sparkles },
                { label: 'Ahorro', pct: Math.max(0, plan.rule503020.savingsPct), target: 20, amount: Math.max(0, plan.rule503020.savings), targetAmount: plan.savingsGap.target, gap: plan.savingsGap, Icon: PiggyBank },
              ].map(item => {
                // Barra lineal 0-100%: el ancho ES el % del ingreso y la línea de
                // objetivo cae en su posición real (target%), sin escalado engañoso.
                const linearWidth = Math.min(100, Math.max(0, item.pct));
                const isSavings = item.label === 'Ahorro';
                const warn = item.gap.status === 'over' || item.gap.status === 'under';
                const gapText = item.gap.status === 'over'
                  ? `Te pasas por ${displayAmount(item.gap.difference)}`
                  : item.gap.status === 'under'
                    ? `Faltan ${displayAmount(item.gap.difference)} para llegar`
                    : item.gap.difference > 0
                      ? isSavings
                        ? `Superas la meta por ${displayAmount(item.gap.difference)}`
                        : `Margen ${displayAmount(item.gap.difference)}`
                      : 'Dentro del rango';
                return (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <item.Icon size={16} className="text-gray-400" />
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{item.label}</span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className={`text-lg font-black ${warn ? 'text-destructive' : 'text-gray-900 dark:text-gray-100'}`}>
                          {item.pct}%
                        </span>
                        <span className="text-xs text-muted-foreground">/ {item.target}%</span>
                      </div>
                    </div>
                    {/* Montos: real vs ideal */}
                    <div className="flex items-center justify-between text-[11px] mb-2 px-0.5">
                      <span className="text-gray-500 dark:text-gray-400">
                        Usas <span className={`font-bold ${warn ? 'text-destructive' : 'text-gray-700 dark:text-gray-300'}`}>{displayAmount(item.amount)}</span>
                      </span>
                      <span className="text-muted-foreground">
                        ideal <span className="font-bold text-gray-600 dark:text-gray-300">{displayAmount(item.targetAmount)}</span>
                      </span>
                    </div>
                    <div className={`mb-2 text-[11px] font-semibold ${warn ? 'text-destructive' : 'text-success'}`}>
                      {gapText}
                    </div>
                    <div className="relative">
                      <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${warn ? 'bg-destructive' : 'bg-primary'} transition-[width] duration-700`}
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

          {plan.recurringForecast.items.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Gastos programados del mes</h3>
                <span className="text-[10px] text-muted-foreground font-medium capitalize">{plan.recurringForecast.monthLabel}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3">
                  <p className="text-[10px] text-muted-foreground">Por venir</p>
                  <p className="mt-1 text-sm font-black text-gray-900 dark:text-gray-100">{displayAmount(plan.recurringForecast.pendingAmount)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3">
                  <p className="text-[10px] text-muted-foreground">Cierre estimado</p>
                  <p className="mt-1 text-sm font-black text-gray-900 dark:text-gray-100">{displayAmount(plan.recurringForecast.projectedExpenses)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3">
                  <p className="text-[10px] text-muted-foreground">Ahorro estimado</p>
                  <p className={`mt-1 text-sm font-black ${plan.recurringForecast.projectedSavings < 0 ? 'text-destructive' : 'text-gray-900 dark:text-gray-100'}`}>
                    {displayAmount(plan.recurringForecast.projectedSavings)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {plan.recurringForecast.items.slice(0, 3).map(item => {
                  const dueLabel = item.status === 'overdue'
                    ? `${Math.abs(item.daysUntilDue)} ${Math.abs(item.daysUntilDue) === 1 ? 'día vencido' : 'días vencidos'}`
                    : item.daysUntilDue === 0
                      ? 'Vence hoy'
                      : `En ${item.daysUntilDue} ${item.daysUntilDue === 1 ? 'día' : 'días'}`;
                  const dueDate = item.dueDate.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-gray-700/60 p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {item.status === 'overdue' ? (
                            <AlertTriangle size={13} className="text-destructive" />
                          ) : (
                            <Clock size={13} className="text-gray-400" />
                          )}
                          <p className="truncate text-xs font-bold text-gray-900 dark:text-gray-100">{item.name}</p>
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {item.category} · {dueLabel} · {dueDate}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-black text-gray-900 dark:text-gray-100">{displayAmount(item.amount)}</span>
                    </div>
                  );
                })}
                {plan.recurringForecast.items.length > 3 && (
                  <p className="text-[11px] text-muted-foreground">
                    +{plan.recurringForecast.items.length - 3} pagos más este mes
                  </p>
                )}
              </div>
            </div>
          )}

          {(salaryActions.length > 0 || visibleRecommendations.length > 0) && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Acciones recomendadas</h3>
                <span className="text-[10px] text-muted-foreground font-medium">sobre tu sueldo mensual</span>
              </div>
              {salaryActions.length > 0 && (
                <div className="space-y-2 mb-4">
                  {salaryActions.map(item => (
                    <div key={item.key} className="flex items-start justify-between gap-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 dark:text-gray-100">{item.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{item.message}</p>
                      </div>
                      <span className="shrink-0 text-xs font-black text-gray-900 dark:text-gray-100">{displayAmount(item.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {visibleRecommendations.length > 0 && (
                <div className="space-y-2">
                  {visibleRecommendations.map(rec => (
                    <div key={rec.category} className="flex items-center justify-between gap-3 rounded-xl border border-primary/10 bg-primary/5 p-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 dark:text-gray-100">{rec.category}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Límite sugerido {displayAmount(rec.suggestedLimit)}/mes · {rec.reason}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUseRecommendation(rec.category, rec.suggestedLimit)}
                        className="shrink-0 rounded-lg bg-primary-solid px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
                      >
                        Usar sugerencia
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
            {/* Fondo de emergencia: cobertura REAL desde el saldo líquido (no desde
                cero). Barra 0→6 meses con marca del mínimo (3 meses = 50%). Sin
                gastos registrados no hay base para medir cobertura → estado neutro. */}
            <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Shield size={14} className={plan.emergencyFund.monthlyExpenses <= 0 ? 'text-gray-400' : plan.emergencyFund.status === 'none' ? 'text-destructive' : plan.emergencyFund.status === 'building' ? 'text-warning' : 'text-success'} />
                  <span className="text-xs font-bold text-gray-800 dark:text-gray-200">Fondo de emergencia</span>
                </div>
                {plan.emergencyFund.monthlyExpenses > 0 && (
                  <span className="text-xs font-bold text-gray-900 dark:text-gray-100">
                    {/* Floor a 1 decimal: nunca redondear hacia arriba cruzando un umbral
                        de estado (2.96 mostraría "3.0" con el estado aún en "building"). */}
                    {formatCoverageMonths(plan.emergencyFund.coverageMonths)} <span className="font-normal text-muted-foreground">meses cubiertos</span>
                  </span>
                )}
              </div>
              {plan.emergencyFund.monthlyExpenses > 0 ? (
                <>
                  <div className="relative">
                    <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-[width] duration-700 ${plan.emergencyFund.status === 'none' ? 'bg-destructive' : plan.emergencyFund.status === 'building' ? 'bg-warning' : 'bg-success'}`}
                        style={{ width: `${Math.min(100, (plan.emergencyFund.coverageMonths / 6) * 100)}%` }} />
                    </div>
                    {/* marca del mínimo: 3 de 6 meses = 50% del ancho */}
                    <div className="absolute -top-0.5 bottom-0 w-0.5 bg-gray-500 dark:bg-gray-400 rounded-full" style={{ left: '50%' }} />
                  </div>
                  <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                    <span>mín 3 · ideal 6 meses</span>
                    <span className="font-medium">
                      {plan.emergencyFund.coverageMonths >= 3
                        ? '✓ cubres el mínimo'
                        : plan.emergencyFund.monthsTo3m === null
                          ? 'sin ahorro mensual para avanzar'
                          : `${plan.emergencyFund.monthsTo3m} ${plan.emergencyFund.monthsTo3m === 1 ? 'mes' : 'meses'} al mínimo`}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Registra tus gastos para calcular cuántos meses cubre tu fondo de emergencia.
                </p>
              )}
            </div>

            {/* Uso de tarjetas (solo si hay crédito): benchmark sano <30%. */}
            {plan.creditUtilization && (
              <div className="mt-3 flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center gap-2">
                  <CreditCard size={13} className="text-gray-400" />
                  <span className="text-[11px] text-gray-600 dark:text-gray-400">Uso de tarjetas</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${plan.creditUtilization.ratio <= 0.3 ? 'text-success' : plan.creditUtilization.ratio <= 0.5 ? 'text-warning' : 'text-destructive'}`}>
                    {Math.round(plan.creditUtilization.ratio * 100)}%
                  </span>
                  <span className="text-[10px] text-muted-foreground">{plan.creditUtilization.ratio <= 0.3 ? 'sano' : plan.creditUtilization.ratio <= 0.5 ? 'medio' : 'alto'}</span>
                </div>
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

        </>
      ) : (
        <div className="card text-center py-8">
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{planEmptyState?.title ?? 'No hay suficientes datos'}</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto leading-relaxed">
            {planEmptyState?.message ?? `No hay suficientes datos desde ${planConfig.startMonth} para generar el plan.`}
          </p>
          <div className="mt-3 flex justify-center gap-3">
            <button onClick={handleOpenIncomeEditor} className="text-xs text-primary hover:underline">Editar sueldo</button>
            <button onClick={() => setShowCloseConfirm(true)} className="text-xs text-purple-600 hover:underline">Reconfigurar</button>
          </div>
          <div className="mt-4 text-left">{incomeEditor}</div>
        </div>
      )}
        </div>
      )}


      <ConfirmDialog
        isOpen={showCloseConfirm}
        title="¿Cerrar plan financiero?"
        message="Se eliminará tu configuración guardada. Podrás iniciar uno nuevo en cualquier momento."
        confirmLabel="Cerrar plan"
        onConfirm={handleClosePlan}
        onClose={() => setShowCloseConfirm(false)}
      />
    </div>
  );
};
