'use client';

/**
 * useImportWizard — estado + lógica del wizard de importación de extractos
 * (Q-godfiles). Extraído de ImportTransactionsModal (god-file de 1230 LOC) para
 * que el componente quede como capa de presentación delgada y la lógica sea
 * testeable de forma aislada.
 *
 * NO toca el commit de dinero: la escritura atómica a Firestore vive en
 * `useImportTransactions` (writeBatch + increment(usedCredit)), que este hook
 * solo orquesta. Parsers, dedup, aprendizaje y categorización IA se reutilizan
 * de sus utilidades existentes.
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import { useGeminiKey } from '../contexts/GeminiKeyContext';
import { useAuth } from './useAuth';
import { useImportTransactions, type ImportRow } from './useImportTransactions';
import { useLocalStorage } from './useLocalStorage';
import { isInternalTransferDescription, parseCSV } from '../utils/csvParser';
import { transferImportKey } from '../utils/importDuplicates';
import { parseXLSX } from '../utils/xlsxParser';
import { parsePDF } from '../utils/pdfParser';
import { categorizeWithAI } from '../utils/aiCategorizer';
import {
  findLearnedCategory,
  groupImportRowsByPattern,
  upsertImportLearningRule,
  type ImportLearningRule,
} from '../utils/importLearning';
import { CREDIT_PAYMENT_CATEGORY, DEFAULT_CATEGORIES, SPECIAL_CATEGORIES } from '../config/constants';
import type { Account, Categories, Transaction } from '../types/finance';
import type { WizardStep, ImportParseStats, AISuggestion } from '../types/import';

const FALLBACK_CATEGORIES = [
  ...new Set([...DEFAULT_CATEGORIES.expense, ...DEFAULT_CATEGORIES.income, CREDIT_PAYMENT_CATEGORY]),
];

const categoryCollator = new Intl.Collator('es-CO', { sensitivity: 'base' });

const normalizeCategory = (category: string) =>
  category.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const isOtherCategory = (category: string) => normalizeCategory(category) === 'otros';

const isSpecialCategory = (category: string) =>
  SPECIAL_CATEGORIES.adjustmentCategories.some(item => normalizeCategory(item) === normalizeCategory(category));

export interface UseImportWizardArgs {
  accounts: Account[];
  existingTransactions: Transaction[];
  categories: Categories;
  onClose: () => void;
}

export function useImportWizard({ accounts, existingTransactions, categories, onClose }: UseImportWizardArgs) {
  const { isConfigured: aiKeyConfigured, hasConsent: aiHasConsent } = useGeminiKey();
  // Motivo por el que la IA no está disponible (para mensajes precisos):
  // 'no-key' = falta API key · 'no-consent' = hay key pero falta autorizar.
  const aiReason: 'no-key' | 'no-consent' | null =
    !aiKeyConfigured ? 'no-key' : !aiHasConsent ? 'no-consent' : null;
  const aiUnavailableMessage =
    aiReason === 'no-key'
      ? 'Necesitas una API key gratuita de Gemini.'
      : 'Tienes API key pero falta autorizar el envío de datos a Gemini.';
  const { user } = useAuth();
  const { importTransactions, status, progress, result, reset } = useImportTransactions(user?.uid || null, accounts);
  const importRulesKey = `moneytrack_import_rules_${user?.uid ?? 'guest'}`;
  const [learningRules, setLearningRules] = useLocalStorage<ImportLearningRule[]>(importRulesKey, []);

  const [step, setStep] = useState<WizardStep>('upload');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [parseError, setParseError] = useState('');
  const [fileName, setFileName] = useState('');
  const [parseStats, setParseStats] = useState<ImportParseStats | null>(null);
  const [aiCategorizing, setAiCategorizing] = useState(false);
  const [aiApplied, setAiApplied] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfNeedsAI, setPdfNeedsAI] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nonCreditAccounts = accounts.filter(a => a.type !== 'credit');
  const creditAccounts = accounts.filter(a => a.type === 'credit');
  const categoryOptions = useMemo(
    () => [...new Set([...categories.expense, ...categories.income, CREDIT_PAYMENT_CATEGORY])]
      .sort(categoryCollator.compare),
    [categories.expense, categories.income]
  );
  const availableCategoryOptions = useMemo(
    () => categoryOptions.length > 0
      ? categoryOptions
      : [...FALLBACK_CATEGORIES].sort(categoryCollator.compare),
    [categoryOptions]
  );
  const inferTransferRoute = useCallback((baseAccountId: string, isInternalTransfer: boolean): { accountId: string; toAccountId?: string } => {
    if (!isInternalTransfer) return { accountId: baseAccountId };

    const selectedAccount = accounts.find(account => account.id === baseAccountId);
    if (selectedAccount?.type === 'credit' && selectedAccount.id) {
      const linkedSourceId = selectedAccount.bankAccountId && accounts.some(account => account.id === selectedAccount.bankAccountId)
        ? selectedAccount.bankAccountId
        : undefined;

      return linkedSourceId
        ? { accountId: linkedSourceId, toAccountId: selectedAccount.id }
        : { accountId: baseAccountId };
    }

    const linkedCreditAccounts = accounts.filter(account =>
      account.type === 'credit' &&
      account.bankAccountId === baseAccountId &&
      account.id
    );

    return linkedCreditAccounts.length === 1
      ? { accountId: baseAccountId, toAccountId: linkedCreditAccounts[0].id }
      : { accountId: baseAccountId };
  }, [accounts]);

  const handleClose = useCallback(() => {
    setStep('upload');
    setRows([]);
    setSelectedAccountId('');
    setParseError('');
    setFileName('');
    setParseStats(null);
    setAiApplied(false);
    setAiSuggestions([]);
    setPdfParsing(false);
    setPdfNeedsAI(false);
    reset();
    onClose();
  }, [onClose, reset]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError('');
    setFileName(file.name);
    setAiSuggestions([]);
    setAiApplied(false);
    setPdfNeedsAI(false);

    const name = file.name.toLowerCase();
    const isXLSX = name.endsWith('.xlsx') || name.endsWith('.xls');
    const isPDF = name.endsWith('.pdf');

    const applyResult = (result: ReturnType<typeof parseCSV>) => {
      if (result.rows.length === 0) {
        setParseError(
          result.errors.length > 0
            ? result.errors.join('. ')
            : 'No se encontraron transacciones válidas. Verifica que el archivo tenga columnas de fecha, descripción y monto.'
        );
        return;
      }

      const accountId = selectedAccountId || nonCreditAccounts[0]?.id || accounts[0]?.id || '';
      if (!selectedAccountId && accountId) {
        setSelectedAccountId(accountId);
      }

      // ── Detección de duplicados (todo en memoria, sin llamadas a Firestore) ──

      // Clave de identidad: tipo|día|monto
      const dayKey = (d: Date) =>
        `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      const descKey = (description: string) =>
        description.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
      const txKey = (type: string, date: Date, amount: number, description: string) =>
        `${type}|${dayKey(date)}|${amount.toFixed(2)}|${descKey(description)}`;
      const txDate = (value: unknown) => {
        if (value instanceof Date) return value;
        if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
          return (value as { toDate: () => Date }).toDate();
        }
        return new Date(value as string | number);
      };

      // 1. Índice de transacciones existentes ya en memoria (cero reads Firestore)
      const existingAccountKeys = new Set<string>();
      const existingInternalTransferKeys = new Set<string>();
      existingTransactions.forEach(tx => {
        const d = txDate(tx.date);
        if (isNaN(d.getTime())) return;

        if (tx.accountId === accountId) {
          existingAccountKeys.add(txKey(tx.type, d, tx.amount, tx.description));
        }
        // Huella de transferencia/pago SIN descripción: el texto difiere entre
        // bancos ("Pago PSE Nu" vs "Gracias por tu pago"), así que cruzamos por
        // monto+día contra todas las cuentas (F7).
        existingInternalTransferKeys.add(transferImportKey(d, tx.amount));
      });

      // 2. Detectar duplicados dentro del propio archivo (misma fila repetida)
      const seenInFile = new Set<string>();

      const mapped = result.rows.map(r => {
        const isInternalTransfer = r.type === 'transfer' || isInternalTransferDescription(r.description);
        const key = isInternalTransfer
          ? transferImportKey(r.date, r.amount)
          : txKey(r.type, r.date, r.amount, r.description);

        const duplicateInDB = isInternalTransfer
          ? existingInternalTransferKeys.has(key)
          : existingAccountKeys.has(key);
        const duplicateInFile = seenInFile.has(key);

        if (!duplicateInFile) seenInFile.add(key);

        const isDuplicate = duplicateInDB || duplicateInFile;
        const transferRoute = inferTransferRoute(accountId, isInternalTransfer);
        const learnedCategory = r.categorySource === 'file'
          ? null
          : findLearnedCategory(r.description, learningRules, availableCategoryOptions);
        return {
          ...r,
          category: learnedCategory ?? r.suggestedCategory,
          accountId: transferRoute.accountId,
          toAccountId: transferRoute.toAccountId,
          // No incluir por defecto duplicados, transferencias ni montos en moneda
          // extranjera sin TRM (no se pueden convertir a COP de forma segura).
          include: !isDuplicate && !isInternalTransfer && !r.needsExchangeRate,
          isDuplicate,
        };
      });

      const duplicateCount = mapped.filter(r => r.isDuplicate).length;
      const needsRateCount = mapped.filter(r => r.needsExchangeRate).length;
      setParseStats({ total: result.rows.length, skipped: result.skippedRows, duplicates: duplicateCount, needsRate: needsRateCount });
      setRows(mapped);
    };

    if (isPDF) {
      // El PDF se procesa con IA: si no está disponible, mostramos un bloque
      // con CTA en vez de dejar al usuario sin salida con un error técnico.
      if (aiReason) {
        setPdfNeedsAI(true);
        setFileName('');
        return;
      }
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const buffer = ev.target?.result as ArrayBuffer;
        setPdfParsing(true);
        const result = await parsePDF(buffer);
        setPdfParsing(false);
        applyResult(result);
      };
      reader.readAsArrayBuffer(file);
    } else if (isXLSX) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const buffer = ev.target?.result as ArrayBuffer;
        applyResult(parseXLSX(buffer, categories));
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        applyResult(parseCSV(text, categories));
      };
      reader.readAsText(file, 'UTF-8');
    }
  }, [
    selectedAccountId,
    accounts,
    nonCreditAccounts,
    existingTransactions,
    categories,
    inferTransferRoute,
    learningRules,
    availableCategoryOptions,
    aiReason,
  ]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    // Reusar la lógica del input
    const dt = new DataTransfer();
    dt.items.add(file);
    if (fileInputRef.current) {
      fileInputRef.current.files = dt.files;
      fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, []);

  const handleAccountChange = useCallback((accountId: string) => {
    setSelectedAccountId(accountId);
    setRows(prev => prev.map(r => {
      const isInternalTransfer = r.type === 'transfer' || isInternalTransferDescription(r.description);
      const transferRoute = inferTransferRoute(accountId, isInternalTransfer);
      return { ...r, accountId: transferRoute.accountId, toAccountId: transferRoute.toAccountId };
    }));
  }, [inferTransferRoute]);

  const handleToggleRow = useCallback((index: number) => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, include: !r.include } : r));
  }, []);

  const handleToggleAll = useCallback((include: boolean) => {
    setRows(prev => prev.map(r => ({ ...r, include })));
  }, []);

  const handleCategoryChange = useCallback((index: number, category: string) => {
    const row = rows[index];
    if (row && row.category !== category) {
      setLearningRules(prev => upsertImportLearningRule(prev, row.description, category));
      setAiSuggestions(prev => prev
        .map(suggestion => ({
          ...suggestion,
          indexes: suggestion.indexes.filter(rowIndex => rowIndex !== index),
        }))
        .filter(suggestion => suggestion.indexes.length > 0)
      );
    }
    setRows(prev => prev.map((r, i) => i === index ? { ...r, category } : r));
  }, [rows, setLearningRules]);

  const handleTypeChange = useCallback((index: number, type: 'income' | 'expense' | 'transfer') => {
    setRows(prev => prev.map((r, i) => {
      if (i !== index) return r;
      const transferRoute = inferTransferRoute(r.accountId, type === 'transfer');
      return { ...r, type, accountId: transferRoute.accountId, toAccountId: transferRoute.toAccountId };
    }));
  }, [inferTransferRoute]);

  const handleDateChange = useCallback((index: number, date: Date) => {
    setRows(prev => prev.map((r, idx) => idx === index ? { ...r, date } : r));
  }, []);

  const handleBulkYearChange = useCallback((targetYear: number) => {
    if (!targetYear) return;
    setRows(prev => prev.map(r => {
      const d = new Date(r.date);
      d.setFullYear(targetYear);
      return { ...r, date: d };
    }));
  }, []);

  const handleImport = useCallback(async () => {
    await importTransactions(rows);
    setStep('done');
  }, [importTransactions, rows]);

  const handleAICategorize = useCallback(async () => {
    if (aiCategorizing || rows.length === 0) return;
    setAiCategorizing(true);
    try {
      const rowsForAI = rows
        .map((row, index) => ({ row, index }))
        .filter((item): item is { row: ImportRow & { type: 'income' | 'expense' }; index: number } =>
          item.row.include &&
          item.row.type !== 'transfer' &&
          item.row.categorySource !== 'file' &&
          isOtherCategory(item.row.category) &&
          !isSpecialCategory(item.row.category)
        );

      const groups = groupImportRowsByPattern(rowsForAI);
      const toAnalyze = groups.map((group, index) => ({
        index,
        description: `${group.pattern}: ${group.sample.description}`,
        amount: group.sample.amount,
        type: group.sample.type,
        currentCategory: group.sample.category,
      }));

      const results = await categorizeWithAI(toAnalyze);
      const applicableResults = results.filter(r => r.confidence >= 0.75 && !isOtherCategory(r.category));
      const suggestions = applicableResults
        .map((result): AISuggestion | null => {
          const group = groups[result.index];
          if (!group) return null;

          return {
            id: `${group.pattern}-${result.category}`,
            pattern: group.pattern,
            category: result.category,
            confidence: result.confidence,
            indexes: group.indexes,
            sampleDescription: group.sample.description,
            sampleAmount: group.sample.amount,
          };
        })
        .filter((suggestion): suggestion is AISuggestion => suggestion !== null)
        .sort((a, b) => categoryCollator.compare(a.category, b.category) || categoryCollator.compare(a.pattern, b.pattern));

      setAiSuggestions(suggestions);
    } catch {
      // silently fail — categories stay as keyword-based
    } finally {
      setAiCategorizing(false);
    }
  }, [aiCategorizing, rows]);

  const handleSuggestionCategoryChange = useCallback((suggestionId: string, category: string) => {
    setAiSuggestions(prev => prev.map(suggestion =>
      suggestion.id === suggestionId ? { ...suggestion, category } : suggestion
    ));
  }, []);

  const handleDiscardAISuggestions = useCallback(() => {
    setAiSuggestions([]);
  }, []);

  const handleApplyAISuggestions = useCallback(() => {
    if (aiSuggestions.length === 0) return;

    setRows(prev => {
      const updated = [...prev];
      aiSuggestions.forEach(suggestion => {
        suggestion.indexes.forEach(rowIndex => {
          if (updated[rowIndex]) {
            updated[rowIndex] = { ...updated[rowIndex], category: suggestion.category };
          }
        });
      });
      return updated;
    });

    setLearningRules(prev => aiSuggestions.reduce(
      (acc, suggestion) => upsertImportLearningRule(acc, suggestion.sampleDescription, suggestion.category),
      prev
    ));
    setAiSuggestions([]);
    setAiApplied(true);
  }, [aiSuggestions, setLearningRules]);

  const includedCount = rows.filter(r => r.include).length;
  const aiSuggestionTransactionCount = useMemo(
    () => new Set(aiSuggestions.flatMap(suggestion => suggestion.indexes)).size,
    [aiSuggestions]
  );
  const aiSuggestionsByCategory = useMemo(() => {
    const grouped = new Map<string, AISuggestion[]>();
    aiSuggestions.forEach(suggestion => {
      const current = grouped.get(suggestion.category) ?? [];
      current.push(suggestion);
      grouped.set(suggestion.category, current);
    });

    return [...grouped.entries()]
      .sort(([a], [b]) => categoryCollator.compare(a, b))
      .map(([category, suggestions]) => ({
        category,
        suggestions: suggestions.sort((a, b) => categoryCollator.compare(a.pattern, b.pattern)),
      }));
  }, [aiSuggestions]);

  return {
    // estado
    step, setStep,
    rows, setRows,
    selectedAccountId,
    parseError,
    fileName,
    parseStats,
    aiCategorizing,
    aiApplied,
    aiSuggestions,
    pdfParsing,
    pdfNeedsAI,
    fileInputRef,
    // commit (de useImportTransactions)
    status, progress, result,
    // computed
    nonCreditAccounts,
    creditAccounts,
    availableCategoryOptions,
    includedCount,
    aiSuggestionTransactionCount,
    aiSuggestionsByCategory,
    aiReason,
    aiUnavailableMessage,
    // handlers
    handleClose,
    handleFileChange,
    handleDrop,
    handleAccountChange,
    handleToggleRow,
    handleToggleAll,
    handleCategoryChange,
    handleTypeChange,
    handleDateChange,
    handleBulkYearChange,
    handleImport,
    handleAICategorize,
    handleSuggestionCategoryChange,
    handleDiscardAISuggestions,
    handleApplyAISuggestions,
  } as const;
}
