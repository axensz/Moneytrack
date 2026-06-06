/**
 * Módulo de IA para el Plan Financiero.
 * Llama a Gemini con el resumen del plan para consejos personalizados.
 */

import type { FinancialPlan, PlanConfig } from '../hooks/useFinancialPlan';
import { formatCurrency } from '../utils/formatters';
import { logger } from '../utils/logger';
import { getGeminiClient } from './geminiClient';

function buildPlanPrompt(plan: FinancialPlan, config: PlanConfig): string {
  const months = plan.months.map(m => `  ${m.label}: gastos ${formatCurrency(m.expenses)}, ahorro ${m.savingsRate}%`).join('\n');

  return `Eres un asesor financiero colombiano amigable. Da exactamente 3 consejos CORTOS, CONCRETOS y ACCIONABLES basados en estos datos.

REGLAS:
- Máximo 3 consejos numerados, cada uno de 1-2 líneas.
- Sé práctico: di QUÉ hacer, no por qué.
- Usa moneda colombiana ($ con puntos).
- NO menciones "inconsistencias" ni cuestiones los datos.
- Si el porcentaje de necesidades/gustos es alto, simplemente sugiere cómo reducirlo.

DATOS:
- Ingreso: ${formatCurrency(config.declaredIncome)}/mes
- Score: ${plan.score.total}/100 (${plan.score.level})
- Necesidades: ${plan.rule503020.needsPct}% (ideal 50%) = ${formatCurrency(plan.rule503020.needs)}/mes
- Gustos: ${plan.rule503020.wantsPct}% (ideal 30%) = ${formatCurrency(plan.rule503020.wants)}/mes
- Ahorro: ${plan.rule503020.savingsPct}% (ideal 20%) = ${formatCurrency(plan.rule503020.savings)}/mes
- Gasto promedio: ${formatCurrency(plan.avgMonthlyExpenses)}/mes
- Tendencia: ${plan.trend === 'improving' ? 'mejorando' : plan.trend === 'declining' ? 'empeorando' : 'estable'}
${plan.projection.monthsToEmergencyFund ? `- Fondo emergencia en: ${plan.projection.monthsToEmergencyFund} meses` : '- Ahorro insuficiente para fondo de emergencia'}

HISTÓRICO:
${months}`;
}

export async function getFinancialAdvice(plan: FinancialPlan, config: PlanConfig): Promise<string> {
  const client = getGeminiClient();
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
