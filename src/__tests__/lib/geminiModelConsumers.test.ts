import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setGeminiModel } from '../../lib/geminiConfig';
import { sendChatMessage } from '../../lib/gemini';
import { getFinancialAdvice } from '../../lib/geminiPlan';
import { parseDateWithAI } from '../../components/views/transactions/components/DateFilterDropdown';
import type { FinancialPlan, PlanConfig } from '../../hooks/useFinancialPlan';

const clientMocks = vi.hoisted(() => ({
  interactionCreate: vi.fn(),
  generateContent: vi.fn(),
}));

vi.mock('../../lib/geminiClient', () => ({
  getGeminiClient: async () => ({
    interactions: { create: clientMocks.interactionCreate },
    models: { generateContent: clientMocks.generateContent },
  }),
  isAiEnabled: () => true,
}));

const minimalPlan = {
  months: [],
  analysisLabel: 'Último mes',
  score: { total: 80, level: 'Bien' },
  rule503020: { needsPct: 50, needs: 500, wantsPct: 30, wants: 300, savingsPct: 20, savings: 200 },
  avgMonthlyExpenses: 800,
  trend: 'stable',
  emergencyFund: { monthsTo3m: 0, coverageMonths: 3 },
  needsGap: { status: 'ok', difference: 0, current: 500, target: 500 },
  wantsGap: { status: 'ok', difference: 0, current: 300, target: 300 },
  savingsGap: { status: 'ok', difference: 0, current: 200, target: 200 },
  actionItems: [],
  topDrivers: [],
  recurringForecast: { items: [], pendingAmount: 0, projectedExpenses: 0, projectedSavings: 0, projectedSavingsRate: 0 },
} as unknown as FinancialPlan;
const planConfig = { startMonth: '2026-08', declaredIncome: 1_000 } as PlanConfig;

describe('selected Gemini model consumers', () => {
  beforeEach(() => {
    clientMocks.interactionCreate.mockReset();
    clientMocks.generateContent.mockReset();
    setGeminiModel('gemini-3.8-flash');
  });

  it('uses the selected model for chat', async () => {
    clientMocks.generateContent.mockResolvedValue({ text: 'Listo', functionCalls: undefined });

    await sendChatMessage('Hola', [], { transactions: [], accounts: [], categories: { income: [], expense: [] } });

    expect(clientMocks.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-3.8-flash' }),
    );
    expect(clientMocks.interactionCreate).not.toHaveBeenCalled();
  });

  it('uses the selected model for smart date filters', async () => {
    clientMocks.generateContent.mockResolvedValue({
      text: '{"startDate":"2026-09-01","endDate":"2026-09-13"}',
    });

    await parseDateWithAI('este mes');

    expect(clientMocks.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-3.8-flash' }),
    );
  });

  it('uses the selected model for the financial plan', async () => {
    clientMocks.generateContent.mockResolvedValue({ text: 'Consejo' });

    await getFinancialAdvice(minimalPlan, planConfig);

    expect(clientMocks.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-3.8-flash' }),
    );
  });
});
