/**
 * Tests para useImportAI — hook de categorización asistida por IA.
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useImportAI } from '../../hooks/useImportAI';
import type { ImportRow } from '../../hooks/useImportTransactions';
import type { ImportLearningRule } from '../../utils/importLearning';

// Mock categorizeWithAI
vi.mock('../../utils/aiCategorizer', () => ({
  categorizeWithAI: vi.fn().mockResolvedValue([]),
}));

import { categorizeWithAI } from '../../utils/aiCategorizer';

const mockedCategorizeWithAI = vi.mocked(categorizeWithAI);

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    date: new Date('2024-06-15'),
    description: 'COMPRA EN EXITO CALLE 80',
    amount: 50000,
    type: 'expense',
    category: 'Otros',
    categorySource: undefined,
    accountId: 'acc-1',
    include: true,
    isDuplicate: false,
    ...overrides,
  };
}

function setupHook(overrides: Partial<Parameters<typeof useImportAI>[0]> = {}) {
  const setLearningRules = vi.fn();
  const args = {
    availableCategoryOptions: ['Alimentación', 'Transporte', 'Salud', 'Otros'],
    learningRules: [] as ImportLearningRule[],
    setLearningRules,
    ...overrides,
  };
  const hook = renderHook(() => useImportAI(args));
  return { hook, setLearningRules };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useImportAI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('estado inicial', () => {
    it('expone los valores iniciales correctos', () => {
      const { hook } = setupHook();
      const { result } = hook;

      expect(result.current.aiCategorizing).toBe(false);
      expect(result.current.aiApplied).toBe(false);
      expect(result.current.aiSuggestions).toEqual([]);
      expect(result.current.aiSuggestionTransactionCount).toBe(0);
      expect(result.current.aiSuggestionsByCategory).toEqual([]);
    });
  });

  describe('handleAICategorize — filtro de elegibilidad (Req 2.1)', () => {
    it('filtra filas no incluidas', async () => {
      const { hook } = setupHook();
      const rows = [makeRow({ include: false })];

      await act(async () => {
        await hook.result.current.handleAICategorize(rows);
      });

      expect(mockedCategorizeWithAI).toHaveBeenCalledWith([]);
    });

    it('filtra filas tipo transfer', async () => {
      const { hook } = setupHook();
      const rows = [makeRow({ type: 'transfer' })];

      await act(async () => {
        await hook.result.current.handleAICategorize(rows);
      });

      expect(mockedCategorizeWithAI).toHaveBeenCalledWith([]);
    });

    it('filtra filas con categorySource "file"', async () => {
      const { hook } = setupHook();
      const rows = [makeRow({ categorySource: 'file' })];

      await act(async () => {
        await hook.result.current.handleAICategorize(rows);
      });

      expect(mockedCategorizeWithAI).toHaveBeenCalledWith([]);
    });

    it('filtra filas con categoría distinta de "Otros"', async () => {
      const { hook } = setupHook();
      const rows = [makeRow({ category: 'Alimentación' })];

      await act(async () => {
        await hook.result.current.handleAICategorize(rows);
      });

      expect(mockedCategorizeWithAI).toHaveBeenCalledWith([]);
    });

    it('incluye filas elegibles (incluida, expense, no-file, categoría Otros)', async () => {
      const { hook } = setupHook();
      const rows = [makeRow()];

      await act(async () => {
        await hook.result.current.handleAICategorize(rows);
      });

      expect(mockedCategorizeWithAI).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ index: 0 })])
      );
    });

    it('no ejecuta si rows está vacío', async () => {
      const { hook } = setupHook();

      await act(async () => {
        await hook.result.current.handleAICategorize([]);
      });

      expect(mockedCategorizeWithAI).not.toHaveBeenCalled();
    });
  });

  describe('handleAICategorize — filtro de confianza y sort (Req 2.2)', () => {
    it('filtra resultados con confianza < 0.75', async () => {
      mockedCategorizeWithAI.mockResolvedValueOnce([
        { index: 0, category: 'Alimentación', confidence: 0.5 },
      ]);
      const { hook } = setupHook();
      const rows = [makeRow()];

      await act(async () => {
        await hook.result.current.handleAICategorize(rows);
      });

      expect(hook.result.current.aiSuggestions).toEqual([]);
    });

    it('filtra resultados con categoría "Otros"', async () => {
      mockedCategorizeWithAI.mockResolvedValueOnce([
        { index: 0, category: 'Otros', confidence: 0.9 },
      ]);
      const { hook } = setupHook();
      const rows = [makeRow()];

      await act(async () => {
        await hook.result.current.handleAICategorize(rows);
      });

      expect(hook.result.current.aiSuggestions).toEqual([]);
    });

    it('incluye resultados con confianza ≥ 0.75 y categoría no-Otros', async () => {
      mockedCategorizeWithAI.mockResolvedValueOnce([
        { index: 0, category: 'Alimentación', confidence: 0.85 },
      ]);
      const { hook } = setupHook();
      const rows = [makeRow()];

      await act(async () => {
        await hook.result.current.handleAICategorize(rows);
      });

      expect(hook.result.current.aiSuggestions).toHaveLength(1);
      expect(hook.result.current.aiSuggestions[0].category).toBe('Alimentación');
    });

    it('ordena sugerencias por categoría y luego por patrón (es-CO)', async () => {
      mockedCategorizeWithAI.mockResolvedValueOnce([
        { index: 0, category: 'Transporte', confidence: 0.9 },
        { index: 1, category: 'Alimentación', confidence: 0.85 },
      ]);
      const { hook } = setupHook();
      const rows = [
        makeRow({ description: 'UBER TRIP' }),
        makeRow({ description: 'EXITO CALLE 80' }),
      ];

      await act(async () => {
        await hook.result.current.handleAICategorize(rows);
      });

      // Alimentación < Transporte en es-CO collation
      expect(hook.result.current.aiSuggestions[0].category).toBe('Alimentación');
      expect(hook.result.current.aiSuggestions[1].category).toBe('Transporte');
    });
  });

  describe('handleAICategorize — estado aiCategorizing (Req 2.4)', () => {
    it('pone aiCategorizing en true mientras procesa', async () => {
      let resolveAI: (value: unknown[]) => void;
      mockedCategorizeWithAI.mockImplementationOnce(() =>
        new Promise(resolve => { resolveAI = resolve as (value: unknown[]) => void; })
      );
      const { hook } = setupHook();
      const rows = [makeRow()];

      // Start without await
      let categorizePromise: Promise<void>;
      act(() => {
        categorizePromise = hook.result.current.handleAICategorize(rows);
      });

      expect(hook.result.current.aiCategorizing).toBe(true);

      await act(async () => {
        resolveAI!([]);
        await categorizePromise!;
      });

      expect(hook.result.current.aiCategorizing).toBe(false);
    });
  });

  describe('handleAICategorize — fallo silencioso (Req 2.5)', () => {
    it('fallo de IA deja sugerencias vacías y aiCategorizing en false', async () => {
      mockedCategorizeWithAI.mockRejectedValueOnce(new Error('Network error'));
      const { hook } = setupHook();
      const rows = [makeRow()];

      await act(async () => {
        await hook.result.current.handleAICategorize(rows);
      });

      expect(hook.result.current.aiSuggestions).toEqual([]);
      expect(hook.result.current.aiCategorizing).toBe(false);
    });
  });

  describe('handleApplyAISuggestions — retorna ImportRow[] inmutable (Req 2.3)', () => {
    it('aplica categorías de sugerencias a los rows correspondientes', async () => {
      mockedCategorizeWithAI.mockResolvedValueOnce([
        { index: 0, category: 'Alimentación', confidence: 0.9 },
      ]);
      const { hook, setLearningRules } = setupHook();
      const rows = [makeRow({ description: 'EXITO CALLE 80' })];

      await act(async () => {
        await hook.result.current.handleAICategorize(rows);
      });

      let updatedRows: ImportRow[];
      act(() => {
        updatedRows = hook.result.current.handleApplyAISuggestions(rows);
      });

      expect(updatedRows![0].category).toBe('Alimentación');
      // Original no se muta
      expect(rows[0].category).toBe('Otros');
    });

    it('persiste reglas de aprendizaje al aplicar sugerencias', async () => {
      mockedCategorizeWithAI.mockResolvedValueOnce([
        { index: 0, category: 'Alimentación', confidence: 0.9 },
      ]);
      const { hook, setLearningRules } = setupHook();
      const rows = [makeRow({ description: 'EXITO CALLE 80' })];

      await act(async () => {
        await hook.result.current.handleAICategorize(rows);
      });

      act(() => {
        hook.result.current.handleApplyAISuggestions(rows);
      });

      expect(setLearningRules).toHaveBeenCalled();
    });

    it('marca aiApplied como true después de aplicar', async () => {
      mockedCategorizeWithAI.mockResolvedValueOnce([
        { index: 0, category: 'Alimentación', confidence: 0.9 },
      ]);
      const { hook } = setupHook();
      const rows = [makeRow()];

      await act(async () => {
        await hook.result.current.handleAICategorize(rows);
      });

      act(() => {
        hook.result.current.handleApplyAISuggestions(rows);
      });

      expect(hook.result.current.aiApplied).toBe(true);
      expect(hook.result.current.aiSuggestions).toEqual([]);
    });

    it('retorna rows sin cambios si no hay sugerencias', () => {
      const { hook } = setupHook();
      const rows = [makeRow()];

      let result: ImportRow[];
      act(() => {
        result = hook.result.current.handleApplyAISuggestions(rows);
      });

      expect(result!).toBe(rows); // misma referencia = sin cambios
    });
  });

  describe('handleSuggestionCategoryChange (Req 2.6)', () => {
    it('cambia la categoría de una sugerencia por id', async () => {
      mockedCategorizeWithAI.mockResolvedValueOnce([
        { index: 0, category: 'Alimentación', confidence: 0.9 },
      ]);
      const { hook } = setupHook();
      const rows = [makeRow()];

      await act(async () => {
        await hook.result.current.handleAICategorize(rows);
      });

      const suggestionId = hook.result.current.aiSuggestions[0].id;

      act(() => {
        hook.result.current.handleSuggestionCategoryChange(suggestionId, 'Transporte');
      });

      expect(hook.result.current.aiSuggestions[0].category).toBe('Transporte');
    });
  });

  describe('handleDiscardAISuggestions (Req 2.6)', () => {
    it('limpia todas las sugerencias', async () => {
      mockedCategorizeWithAI.mockResolvedValueOnce([
        { index: 0, category: 'Alimentación', confidence: 0.9 },
      ]);
      const { hook } = setupHook();
      const rows = [makeRow()];

      await act(async () => {
        await hook.result.current.handleAICategorize(rows);
      });

      expect(hook.result.current.aiSuggestions).toHaveLength(1);

      act(() => {
        hook.result.current.handleDiscardAISuggestions();
      });

      expect(hook.result.current.aiSuggestions).toEqual([]);
    });
  });

  describe('computed values (Req 2.6)', () => {
    it('aiSuggestionTransactionCount cuenta transacciones únicas afectadas', async () => {
      mockedCategorizeWithAI.mockResolvedValueOnce([
        { index: 0, category: 'Alimentación', confidence: 0.9 },
        { index: 1, category: 'Transporte', confidence: 0.85 },
      ]);
      const { hook } = setupHook();
      const rows = [
        makeRow({ description: 'EXITO' }),
        makeRow({ description: 'UBER' }),
      ];

      await act(async () => {
        await hook.result.current.handleAICategorize(rows);
      });

      expect(hook.result.current.aiSuggestionTransactionCount).toBe(2);
    });

    it('aiSuggestionsByCategory agrupa por categoría ordenadas', async () => {
      mockedCategorizeWithAI.mockResolvedValueOnce([
        { index: 0, category: 'Transporte', confidence: 0.9 },
        { index: 1, category: 'Alimentación', confidence: 0.85 },
      ]);
      const { hook } = setupHook();
      const rows = [
        makeRow({ description: 'UBER TRIP' }),
        makeRow({ description: 'EXITO CALLE 80' }),
      ];

      await act(async () => {
        await hook.result.current.handleAICategorize(rows);
      });

      const byCategory = hook.result.current.aiSuggestionsByCategory;
      expect(byCategory).toHaveLength(2);
      expect(byCategory[0].category).toBe('Alimentación');
      expect(byCategory[1].category).toBe('Transporte');
    });
  });
});
