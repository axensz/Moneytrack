/**
 * Módulo de IA para el Plan Financiero.
 * Llama a Gemini con el resumen del plan para consejos personalizados.
 */

import { GoogleGenAI } from '@google/genai';
import type { FinancialPlan, PlanConfig } from '../hooks/useFinancialPlan';
import { formatCurrency } from '../utils/formatters';
import { logger } from '../utils/logger';

const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';

let ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!ai) ai = new GoogleGenAI({ apiKey: API_KEY });
  return ai;
}

function buildPlanPrompt(plan: FinancialPlan, config: PlanConfig): string {
  const months = plan.months.map(m => `  ${m.label}: ingresos ${formatCurrency(m.income)}, gastos ${formatCurrency(m.expenses)}, ahorro ${m.savingsRate}%`).join('\n');

  return `Eres un asesor financiero personal colombiano. Analiza este plan financiero y da 3-4 consejos CONCRETOS y ACCIONABLES. Sé directo, usa datos del usuario. Máximo 200 palabras total.

DATOS DEL USUARIO:
- Ingreso mensual declarado: ${formatCurrency(config.declaredIncome)}
- Score financiero: ${plan.score.total}/100 (${plan.score.level})
- Distribución: Necesidades ${plan.rule503020.needsPct}% | Gustos ${plan.rule503020.wantsPct}% | Ahorro ${plan.rule503020.savingsPct}%
- Gasto promedio mensual: ${formatCurrency(plan.avgMonthlyExpenses)}
- Ahorro promedio mensual: ${formatCurrency(plan.avgMonthlySavings)}
- Tendencia: ${plan.trend === 'improving' ? 'mejorando' : plan.trend === 'declining' ? 'empeorando' : 'estable'}
- Meses para fondo de emergencia: ${plan.projection.monthsToEmergencyFund ?? 'N/A (ahorro negativo)'}

HISTÓRICO MENSUAL:
${months}

Responde con consejos numerados. Usa formato moneda colombiana. No repitas datos obvios.`;
}

export async function getFinancialAdvice(plan: FinancialPlan, config: PlanConfig): Promise<string> {
  const client = getAI();
  const prompt = buildPlanPrompt(plan, config);

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.7, maxOutputTokens: 1024 },
    });
    return response.text || 'No se pudo generar consejos.';
  } catch (error) {
    logger.error('Error getting financial advice from Gemini', error);
    throw error;
  }
}
