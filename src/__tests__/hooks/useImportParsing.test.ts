import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useImportParsing } from '../../hooks/useImportParsing';
import type { Categories } from '../../types/finance';

// Mock parsers
vi.mock('../../utils/csvParser', () => ({
  parseCSV: vi.fn(),
}));
vi.mock('../../utils/xlsxParser', () => ({
  parseXLSX: vi.fn(),
}));
vi.mock('../../utils/pdfParser', () => ({
  parsePDF: vi.fn(),
}));

import { parseCSV } from '../../utils/csvParser';
import { parseXLSX } from '../../utils/xlsxParser';
import { parsePDF } from '../../utils/pdfParser';

const mockParseCSV = vi.mocked(parseCSV);
const mockParseXLSX = vi.mocked(parseXLSX);
const mockParsePDF = vi.mocked(parsePDF);

const categories: Categories = {
  expense: ['Alimentación', 'Transporte', 'Otros'],
  income: ['Salario', 'Otros'],
};

/**
 * Create a File with working .text() and .arrayBuffer() for jsdom.
 */
function makeFile(name: string, content: string = 'dummy'): File {
  const blob = new Blob([content], { type: 'text/plain' });
  const file = new File([blob], name, { type: 'text/plain' });
  // jsdom File doesn't implement text/arrayBuffer, polyfill them
  if (!file.text) {
    file.text = () => Promise.resolve(content);
  }
  if (!file.arrayBuffer) {
    file.arrayBuffer = () => blob.arrayBuffer();
  }
  return file;
}

function makeBinaryFile(name: string): File {
  const buffer = new ArrayBuffer(8);
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const file = new File([blob], name, { type: 'application/octet-stream' });
  if (!file.text) {
    file.text = () => Promise.resolve('');
  }
  if (!file.arrayBuffer) {
    file.arrayBuffer = () => Promise.resolve(buffer);
  }
  return file;
}

const sampleParsedRows = [
  {
    date: new Date('2026-01-15'),
    description: 'Compra supermercado',
    amount: 50000,
    type: 'expense' as const,
    suggestedCategory: 'Alimentación',
    categorySource: 'rules' as const,
    rawLine: '15/01|Compra supermercado|50000',
  },
  {
    date: new Date('2026-01-16'),
    description: 'Nómina empresa',
    amount: 3500000,
    type: 'income' as const,
    suggestedCategory: 'Salario',
    categorySource: 'rules' as const,
    rawLine: '16/01|Nómina empresa|3500000',
  },
];

describe('useImportParsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state correctly', () => {
    const { result } = renderHook(() =>
      useImportParsing({ categories, aiReason: null })
    );

    expect(result.current.fileName).toBe('');
    expect(result.current.parseError).toBe('');
    expect(result.current.parseStats).toBeNull();
    expect(result.current.pdfParsing).toBe(false);
    expect(result.current.pdfNeedsAI).toBe(false);
    expect(result.current.fileInputRef.current).toBeNull();
  });

  describe('file extension routing', () => {
    it('delegates .csv files to parseCSV', async () => {
      mockParseCSV.mockReturnValue({
        rows: sampleParsedRows,
        errors: [],
        totalRows: 2,
        skippedRows: 0,
      });

      const { result } = renderHook(() =>
        useImportParsing({ categories, aiReason: null })
      );

      let rows: unknown[];
      await act(async () => {
        rows = await result.current.parseFile(makeFile('extracto.csv'));
      });

      expect(mockParseCSV).toHaveBeenCalledTimes(1);
      expect(mockParseXLSX).not.toHaveBeenCalled();
      expect(mockParsePDF).not.toHaveBeenCalled();
      expect(rows!).toHaveLength(2);
    });

    it('delegates .xlsx files to parseXLSX', async () => {
      mockParseXLSX.mockReturnValue({
        rows: sampleParsedRows,
        errors: [],
        totalRows: 2,
        skippedRows: 0,
      });

      const { result } = renderHook(() =>
        useImportParsing({ categories, aiReason: null })
      );

      let rows: unknown[];
      await act(async () => {
        rows = await result.current.parseFile(makeBinaryFile('extracto.xlsx'));
      });

      expect(mockParseXLSX).toHaveBeenCalledTimes(1);
      expect(mockParseXLSX).toHaveBeenCalledWith(expect.any(ArrayBuffer), categories);
      expect(mockParseCSV).not.toHaveBeenCalled();
      expect(rows!).toHaveLength(2);
    });

    it('delegates .xls files to parseXLSX', async () => {
      mockParseXLSX.mockReturnValue({
        rows: sampleParsedRows,
        errors: [],
        totalRows: 2,
        skippedRows: 0,
      });

      const { result } = renderHook(() =>
        useImportParsing({ categories, aiReason: null })
      );

      await act(async () => {
        await result.current.parseFile(makeBinaryFile('extracto.xls'));
      });

      expect(mockParseXLSX).toHaveBeenCalledTimes(1);
    });

    it('delegates .pdf files to parsePDF when AI is available', async () => {
      mockParsePDF.mockResolvedValue({
        rows: sampleParsedRows,
        errors: [],
        totalRows: 2,
        skippedRows: 0,
      });

      const { result } = renderHook(() =>
        useImportParsing({ categories, aiReason: null })
      );

      let rows: unknown[];
      await act(async () => {
        rows = await result.current.parseFile(makeBinaryFile('extracto.pdf'));
      });

      expect(mockParsePDF).toHaveBeenCalledTimes(1);
      expect(rows!).toHaveLength(2);
    });

    it('treats unrecognized extensions as CSV', async () => {
      mockParseCSV.mockReturnValue({
        rows: sampleParsedRows,
        errors: [],
        totalRows: 2,
        skippedRows: 0,
      });

      const { result } = renderHook(() =>
        useImportParsing({ categories, aiReason: null })
      );

      await act(async () => {
        await result.current.parseFile(makeFile('extracto.txt'));
      });

      expect(mockParseCSV).toHaveBeenCalledTimes(1);
    });
  });

  describe('ImportRow mapping', () => {
    it('maps ParsedRow fields to ImportRow with correct defaults', async () => {
      mockParseCSV.mockReturnValue({
        rows: sampleParsedRows,
        errors: [],
        totalRows: 2,
        skippedRows: 0,
      });

      const { result } = renderHook(() =>
        useImportParsing({ categories, aiReason: null })
      );

      let rows: Awaited<ReturnType<typeof result.current.parseFile>>;
      await act(async () => {
        rows = await result.current.parseFile(makeFile('test.csv'));
      });

      expect(rows![0]).toMatchObject({
        date: new Date('2026-01-15'),
        description: 'Compra supermercado',
        amount: 50000,
        type: 'expense',
        category: 'Alimentación',
        suggestedCategory: 'Alimentación',
        categorySource: 'rules',
        accountId: '',
        include: true,
        isDuplicate: false,
      });
    });
  });

  describe('parseError handling', () => {
    it('sets parseError when parser returns zero rows with errors', async () => {
      mockParseCSV.mockReturnValue({
        rows: [],
        errors: ['Formato no reconocido'],
        totalRows: 0,
        skippedRows: 0,
      });

      const { result } = renderHook(() =>
        useImportParsing({ categories, aiReason: null })
      );

      await act(async () => {
        await result.current.parseFile(makeFile('bad.csv'));
      });

      expect(result.current.parseError).toBe('Formato no reconocido');
    });

    it('sets default parseError when parser returns zero rows without errors', async () => {
      mockParseCSV.mockReturnValue({
        rows: [],
        errors: [],
        totalRows: 0,
        skippedRows: 0,
      });

      const { result } = renderHook(() =>
        useImportParsing({ categories, aiReason: null })
      );

      await act(async () => {
        await result.current.parseFile(makeFile('empty.csv'));
      });

      expect(result.current.parseError).toContain('No se encontraron transacciones');
    });
  });

  describe('PDF AI guard', () => {
    it('sets pdfNeedsAI when aiReason is no-key', async () => {
      const { result } = renderHook(() =>
        useImportParsing({ categories, aiReason: 'no-key' })
      );

      let rows: unknown[];
      await act(async () => {
        rows = await result.current.parseFile(makeBinaryFile('extracto.pdf'));
      });

      expect(result.current.pdfNeedsAI).toBe(true);
      expect(result.current.fileName).toBe('');
      expect(rows!).toHaveLength(0);
      expect(mockParsePDF).not.toHaveBeenCalled();
    });

    it('sets pdfNeedsAI when aiReason is no-consent', async () => {
      const { result } = renderHook(() =>
        useImportParsing({ categories, aiReason: 'no-consent' })
      );

      await act(async () => {
        await result.current.parseFile(makeBinaryFile('extracto.pdf'));
      });

      expect(result.current.pdfNeedsAI).toBe(true);
      expect(mockParsePDF).not.toHaveBeenCalled();
    });
  });

  describe('pdfParsing state', () => {
    it('sets pdfParsing to false after parsing completes', async () => {
      mockParsePDF.mockResolvedValue({
        rows: sampleParsedRows,
        errors: [],
        totalRows: 2,
        skippedRows: 0,
      });

      const { result } = renderHook(() =>
        useImportParsing({ categories, aiReason: null })
      );

      await act(async () => {
        await result.current.parseFile(makeBinaryFile('test.pdf'));
      });

      // After parsing completes, pdfParsing should be false
      expect(result.current.pdfParsing).toBe(false);
    });

    it('resets pdfParsing to false even if parsePDF throws', async () => {
      mockParsePDF.mockRejectedValue(new Error('AI failure'));

      const { result } = renderHook(() =>
        useImportParsing({ categories, aiReason: null })
      );

      await act(async () => {
        try {
          await result.current.parseFile(makeBinaryFile('test.pdf'));
        } catch {
          // expected
        }
      });

      expect(result.current.pdfParsing).toBe(false);
    });
  });

  describe('parseStats', () => {
    it('computes parseStats from result', async () => {
      const rowsWithRate = [
        ...sampleParsedRows,
        {
          ...sampleParsedRows[0],
          needsExchangeRate: true,
          description: 'Amazon USD',
        },
      ];

      mockParseCSV.mockReturnValue({
        rows: rowsWithRate,
        errors: [],
        totalRows: 5,
        skippedRows: 2,
      });

      const { result } = renderHook(() =>
        useImportParsing({ categories, aiReason: null })
      );

      await act(async () => {
        await result.current.parseFile(makeFile('test.csv'));
      });

      expect(result.current.parseStats).toEqual({
        total: 3,
        skipped: 2,
        duplicates: 0,
        needsRate: 1,
      });
    });
  });

  describe('resetParsing', () => {
    it('resets all state to initial values', async () => {
      mockParseCSV.mockReturnValue({
        rows: sampleParsedRows,
        errors: [],
        totalRows: 2,
        skippedRows: 0,
      });

      const { result } = renderHook(() =>
        useImportParsing({ categories, aiReason: null })
      );

      await act(async () => {
        await result.current.parseFile(makeFile('test.csv'));
      });

      expect(result.current.fileName).toBe('test.csv');

      act(() => {
        result.current.resetParsing();
      });

      expect(result.current.fileName).toBe('');
      expect(result.current.parseError).toBe('');
      expect(result.current.parseStats).toBeNull();
      expect(result.current.pdfParsing).toBe(false);
      expect(result.current.pdfNeedsAI).toBe(false);
    });
  });

  describe('fileName', () => {
    it('exposes the file name after parsing', async () => {
      mockParseCSV.mockReturnValue({
        rows: sampleParsedRows,
        errors: [],
        totalRows: 2,
        skippedRows: 0,
      });

      const { result } = renderHook(() =>
        useImportParsing({ categories, aiReason: null })
      );

      await act(async () => {
        await result.current.parseFile(makeFile('mi-extracto-2026.csv'));
      });

      expect(result.current.fileName).toBe('mi-extracto-2026.csv');
    });
  });
});
