'use client';

/**
 * useImportParsing — hook dedicado al parseo de archivos de extractos bancarios.
 *
 * Detecta la extensión del archivo (.csv, .xlsx/.xls, .pdf) y delega al parser
 * correspondiente (`parseCSV`, `parseXLSX`, `parsePDF`). Produce un array de
 * `ImportRow[]` con datos puros (sin routing ni dedup), dejando esas
 * responsabilidades al pipeline del orquestador.
 *
 * Extracted from `useImportWizard` as part of the import wizard refactor.
 */

import { useState, useRef, useCallback } from 'react';
import { parseCSV } from '../utils/csvParser';
import { parseXLSX } from '../utils/xlsxParser';
import { parsePDF } from '../utils/pdfParser';
import type { ImportRow } from './useImportTransactions';
import type { Categories } from '../types/finance';
import type { ImportParseStats } from '../types/import';

export interface UseImportParsingArgs {
  categories: Categories;
  aiReason: 'no-key' | 'no-consent' | null;
}

export interface UseImportParsingReturn {
  fileName: string;
  parseError: string;
  parseStats: ImportParseStats | null;
  pdfParsing: boolean;
  pdfNeedsAI: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  parseFile: (file: File) => Promise<ImportRow[]>;
  resetParsing: () => void;
}

/**
 * Hook encargado de la lectura y parseo de archivos de extractos bancarios.
 *
 * Responsabilidades:
 * - Detectar extensión (.csv, .xlsx/.xls, .pdf) y delegar al parser correspondiente.
 * - Mapear la salida del parser a `ImportRow[]` con campos requeridos.
 * - Gestionar estados async de PDF (`pdfParsing`, `pdfNeedsAI`).
 * - Exponer `parseError` cuando el parser retorna cero filas.
 * - Aceptar `categories` y pasarlas a parseXLSX/parseCSV para matching de categorías.
 *
 * `parseFile` retorna `ImportRow[]` (datos puros), dejando routing y dedup al orquestador.
 */
export function useImportParsing({ categories, aiReason }: UseImportParsingArgs): UseImportParsingReturn {
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [parseStats, setParseStats] = useState<ImportParseStats | null>(null);
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfNeedsAI, setPdfNeedsAI] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetParsing = useCallback(() => {
    setFileName('');
    setParseError('');
    setParseStats(null);
    setPdfParsing(false);
    setPdfNeedsAI(false);
  }, []);

  const parseFile = useCallback(async (file: File): Promise<ImportRow[]> => {
    setParseError('');
    setFileName(file.name);
    setPdfNeedsAI(false);

    const name = file.name.toLowerCase();
    const isXLSX = name.endsWith('.xlsx') || name.endsWith('.xls');
    const isPDF = name.endsWith('.pdf');

    // Helper to map ParseResult → ImportRow[] and set stats/errors
    const applyResult = (result: { rows: Array<{ date: Date; description: string; amount: number; type: 'income' | 'expense' | 'transfer'; suggestedCategory: string; categorySource?: 'file' | 'rules'; installments?: number; currentInstallment?: number; currency?: string; originalAmount?: number; originalCurrency?: string; exchangeRate?: number; needsExchangeRate?: boolean }>; errors: string[]; skippedRows: number }): ImportRow[] => {
      if (result.rows.length === 0) {
        setParseError(
          result.errors.length > 0
            ? result.errors.join('. ')
            : 'No se encontraron transacciones válidas. Verifica que el archivo tenga columnas de fecha, descripción y monto.'
        );
        setParseStats(null);
        return [];
      }

      // Map parsed rows to ImportRow (pure data, no routing or dedup).
      // `category` defaults to the parser's suggestedCategory; the orchestrator
      // route step may override it with a learned category rule.
      const importRows: ImportRow[] = result.rows.map(r => ({
        date: r.date,
        description: r.description,
        amount: r.amount,
        type: r.type,
        category: r.suggestedCategory,
        suggestedCategory: r.suggestedCategory,
        categorySource: r.categorySource,
        accountId: '', // assigned by orchestrator route step
        include: true, // default; orchestrator dedup step will adjust
        isDuplicate: false,
        installments: r.installments,
        currentInstallment: r.currentInstallment,
        currency: r.currency,
        originalAmount: r.originalAmount,
        originalCurrency: r.originalCurrency,
        exchangeRate: r.exchangeRate,
        needsExchangeRate: r.needsExchangeRate,
      }));

      setParseStats({
        total: result.rows.length,
        skipped: result.skippedRows,
        duplicates: 0, // will be computed by orchestrator after dedup
        needsRate: importRows.filter(r => r.needsExchangeRate).length,
      });

      return importRows;
    };

    // Helper to read file as text (supports environments where File.text() is unavailable)
    const readAsText = (f: File): Promise<string> => {
      if (typeof f.text === 'function') return f.text();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(f, 'UTF-8');
      });
    };

    // Helper to read file as ArrayBuffer (supports environments where File.arrayBuffer() is unavailable)
    const readAsArrayBuffer = (f: File): Promise<ArrayBuffer> => {
      if (typeof f.arrayBuffer === 'function') return f.arrayBuffer();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(f);
      });
    };

    if (isPDF) {
      // PDF requires AI: if unavailable, signal it and return empty
      if (aiReason) {
        setPdfNeedsAI(true);
        setFileName('');
        return [];
      }

      const buffer = await readAsArrayBuffer(file);
      setPdfParsing(true);
      try {
        const result = await parsePDF(buffer);
        return applyResult(result);
      } finally {
        setPdfParsing(false);
      }
    }

    if (isXLSX) {
      const buffer = await readAsArrayBuffer(file);
      const result = parseXLSX(buffer, categories);
      return applyResult(result);
    }

    // Default: CSV (also handles unrecognized extensions per design)
    const text = await readAsText(file);
    const result = parseCSV(text, categories);
    return applyResult(result);
  }, [categories, aiReason]);

  return {
    fileName,
    parseError,
    parseStats,
    pdfParsing,
    pdfNeedsAI,
    fileInputRef,
    parseFile,
    resetParsing,
  };
}
