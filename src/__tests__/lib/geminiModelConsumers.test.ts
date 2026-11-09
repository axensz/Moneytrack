import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setGeminiModel } from '../../lib/geminiConfig';
import { sendChatMessage, sendChatMessageStream } from '../../lib/gemini';
import { getFinancialAdvice } from '../../lib/geminiPlan';
import { parseDateWithAI } from '../../components/views/transactions/components/DateFilterDropdown';
import type { FinancialPlan, PlanConfig } from '../../hooks/useFinancialPlan';

const clientMocks = vi.hoisted(() => ({
  interactionCreate: vi.fn(),
  generateContent: vi.fn(),
  generateContentStream: vi.fn(),
}));

vi.mock('../../lib/geminiClient', () => ({
  getGeminiClient: async () => ({
    interactions: { create: clientMocks.interactionCreate },
    models: {
      generateContent: clientMocks.generateContent,
      generateContentStream: clientMocks.generateContentStream,
    },
  }),
  isAiEnabled: () => true,
}));

/** Convierte una lista de chunks en el AsyncGenerator que devuelve el SDK. */
async function* streamOf(chunks: unknown[]): AsyncGenerator<unknown> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

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
    clientMocks.generateContentStream.mockReset();
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

  // MODELOS DINÁMICOS: con el tipo GeminiModelId relajado a string, un modelo
  // que NO está en la lista estática (p. ej. gemini-4-argon) debe aceptarse y
  // propagarse a las tres superficies.
  it('accepts a dynamic model id (gemini-4-argon) end to end', async () => {
    setGeminiModel('gemini-4-argon');
    clientMocks.generateContent.mockResolvedValue({ text: 'Listo', functionCalls: undefined });

    await sendChatMessage('Hola', [], { transactions: [], accounts: [], categories: { income: [], expense: [] } });

    expect(clientMocks.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-4-argon' }),
    );
  });

  describe('sendChatMessageStream', () => {
    const emptyData = { transactions: [], accounts: [], categories: { income: [], expense: [] } };

    it('concatenates text deltas and reads token usage from the final chunk', async () => {
      clientMocks.generateContentStream.mockResolvedValue(streamOf([
        { text: 'Hola ', functionCalls: undefined },
        { text: 'mundo', functionCalls: undefined },
        {
          text: undefined,
          functionCalls: undefined,
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        },
      ]));
      const deltas: string[] = [];

      const result = await sendChatMessageStream('Hola', [], emptyData, (t) => deltas.push(t));

      expect(clientMocks.generateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3.8-flash' }),
      );
      expect(deltas).toEqual(['Hola ', 'Hola mundo']);
      expect(result.text).toBe('Hola mundo');
      expect(result.tokenUsage?.totalTokens).toBe(15);
      expect(result.action).toBeUndefined();
      expect(clientMocks.generateContent).not.toHaveBeenCalled();
    });

    it('preserves function calling from a text-less streaming chunk', async () => {
      clientMocks.generateContentStream.mockResolvedValue(streamOf([
        {
          text: undefined,
          functionCalls: [{ name: 'add_category', args: { categoryType: 'expense', name: 'Mascotas' } }],
        },
      ]));

      const result = await sendChatMessageStream('Crea categoría Mascotas', [], emptyData, () => {});

      expect(result.action?.type).toBe('add_category');
      expect(result.text.length).toBeGreaterThan(0);
      expect(clientMocks.generateContent).not.toHaveBeenCalled();
    });

    it('falls back to generateContent when the stream rejects', async () => {
      clientMocks.generateContentStream.mockRejectedValue(new Error('stream boom'));
      clientMocks.generateContent.mockResolvedValue({ text: 'Respuesta no-stream', functionCalls: undefined });
      const deltas: string[] = [];

      const result = await sendChatMessageStream('Hola', [], emptyData, (t) => deltas.push(t));

      expect(clientMocks.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3.8-flash' }),
      );
      expect(result.text).toBe('Respuesta no-stream');
      expect(deltas).toEqual([]);
    });

    it('falls back to generateContent when the stream yields nothing', async () => {
      clientMocks.generateContentStream.mockResolvedValue(streamOf([
        { text: undefined, functionCalls: undefined },
      ]));
      clientMocks.generateContent.mockResolvedValue({ text: 'Respuesta no-stream', functionCalls: undefined });

      const result = await sendChatMessageStream('Hola', [], emptyData, () => {});

      expect(clientMocks.generateContent).toHaveBeenCalledTimes(1);
      expect(result.text).toBe('Respuesta no-stream');
    });
  });
});
