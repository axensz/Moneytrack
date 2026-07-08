/**
 * Módulo de IA para el Plan Financiero.
 * Llama a Gemini con el resumen del plan para consejos personalizados.
 */

import type { FinancialPlan, PlanConfig } from '../hooks/useFinancialPlan';
import { formatCurrency } from '../utils/formatters';
import { logger } from '../utils/logger';
import { getGeminiClient } from './geminiClient';

export function buildPlanPrompt(plan: FinancialPlan, config: PlanConfig): string {
  const months = plan.months.map(m => `  ${m.label}: gastos ${formatCurrency(m.expenses)}, ahorro ${m.savingsRate}%`).join('\n');
  const gapLine = (
    label: string,
    gap: FinancialPlan['needsGap'],
    kind: 'spending' | 'saving',
  ) => {
    if (gap.status === 'over') return `- ${label}: se pasa por ${formatCurrency(gap.difference)} (actual ${formatCurrency(gap.current)}, ideal ${formatCurrency(gap.target)})`;
    if (gap.status === 'under') return `- ${label}: faltan ${formatCurrency(gap.difference)} para llegar (actual ${formatCurrency(gap.current)}, ideal ${formatCurrency(gap.target)})`;
    const okDetail = gap.difference > 0
      ? kind === 'saving'
        ? `supera la meta por ${formatCurrency(gap.difference)}`
        : `tiene margen de ${formatCurrency(gap.difference)}`
      : 'esta en el punto ideal';
    return `- ${label}: dentro del rango, ${okDetail} (actual ${formatCurrency(gap.current)}, ideal ${formatCurrency(gap.target)})`;
  };
  const actions = plan.actionItems.length > 0
    ? plan.actionItems.map((item, idx) => `  ${idx + 1}. ${item.label}: ${formatCurrency(item.amount)}${item.category ? ` en ${item.category}` : ''}. ${item.message}`).join('\n')
    : '  Sin acciones urgentes; refuerza el habito actual.';
  const drivers = plan.topDrivers.length > 0
    ? plan.topDrivers.slice(0, 3).map(d => `  - ${d.category}: ${formatCurrency(d.spent)}/mes, recorte sugerido ${formatCurrency(d.suggestedReduction)}`).join('\n')
    : '  No hay categorias por encima del rango 50/30/20.';
  const recurring = plan.recurringForecast.items.length > 0
    ? [
        `- Pagos programados pendientes: ${formatCurrency(plan.recurringForecast.pendingAmount)}`,
        `- Gasto estimado al cierre: ${formatCurrency(plan.recurringForecast.projectedExpenses)}`,
        `- Ahorro estimado al cierre: ${formatCurrency(plan.recurringForecast.projectedSavings)} (${plan.recurringForecast.projectedSavingsRate}%)`,
        ...plan.recurringForecast.items.slice(0, 3).map(item => `  - ${item.name}: ${formatCurrency(item.amount)} vence ${item.dueDate.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}`),
      ].join('\n')
    : '- No hay pagos periodicos pendientes este mes.';

  // Fondo de emergencia en 3 estados. `monthsTo3m` es 0 cuando YA está cubierto y
  // null cuando no hay ahorro para construirlo: un check de truthiness leía el 0
  // ("ya cubierto") como el caso "insuficiente" y le decía a la IA lo contrario.
  const ef = plan.emergencyFund;
  const emergencyLine = ef.monthsTo3m === 0
    ? `- Fondo de emergencia: YA cubierto (${ef.coverageMonths.toFixed(1)} meses de gastos guardados)`
    : ef.monthsTo3m === null
      ? '- Fondo de emergencia: sin ahorro mensual para construirlo'
      : `- Fondo de emergencia: a ${ef.monthsTo3m} meses del mínimo (cubres ${ef.coverageMonths.toFixed(1)} de 3 meses)`;

  return `Eres un asesor financiero colombiano amigable. Da exactamente 3 consejos CORTOS, CONCRETOS y ACCIONABLES basados en estos datos.

REGLAS:
- Máximo 3 consejos numerados, cada uno de 1-2 líneas.
- Sé práctico: di QUÉ hacer, no por qué.
- Usa moneda colombiana ($ con puntos).
- Usa primero la seccion PRIORIDAD Y ACCIONES; no inventes categorias ni montos.
- NO menciones "inconsistencias" ni cuestiones los datos.
- Si el porcentaje de necesidades/gustos es alto, simplemente sugiere cómo reducirlo.

DATOS:
- Ingreso: ${formatCurrency(config.declaredIncome)}/mes
- Periodo analizado: ${plan.analysisLabel}
- Score: ${plan.score.total}/100 (${plan.score.level})
- Necesidades: ${plan.rule503020.needsPct}% (ideal 50%) = ${formatCurrency(plan.rule503020.needs)}/mes
- Gustos: ${plan.rule503020.wantsPct}% (ideal 30%) = ${formatCurrency(plan.rule503020.wants)}/mes
- Ahorro: ${plan.rule503020.savingsPct}% (ideal 20%) = ${formatCurrency(plan.rule503020.savings)}/mes
- Gasto promedio: ${formatCurrency(plan.avgMonthlyExpenses)}/mes
- Tendencia: ${plan.trend === 'improving' ? 'mejorando' : plan.trend === 'declining' ? 'empeorando' : 'estable'}
${emergencyLine}

BRECHAS 50/30/20:
${gapLine('Necesidades', plan.needsGap, 'spending')}
${gapLine('Gustos', plan.wantsGap, 'spending')}
${gapLine('Ahorro', plan.savingsGap, 'saving')}

PRIORIDAD Y ACCIONES:
${actions}

CATEGORIAS QUE EXPLICAN EXCESOS:
${drivers}

PAGOS PROGRAMADOS DEL MES:
${recurring}

HISTÓRICO:
${months}`;
}

export async function getFinancialAdvice(plan: FinancialPlan, config: PlanConfig): Promise<string> {
  const client = await getGeminiClient();
  const prompt = buildPlanPrompt(plan, config);

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.7, maxOutputTokens: 2048 },
    });
    return response.text || 'No se pudo generar consejos.';
  } catch (error) {
    logger.error('Error getting financial advice from Gemini', error);
    throw error;
  }
}
