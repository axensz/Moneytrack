'use client';

/**
 * useImportWizard — orquestador delgado del wizard de importación de extractos.
 *
 * Compone los hooks granulares `useImportParsing`, `useImportAI` y `useImportDedup`
 * con un pipeline explícito: parse → route → dedup → setState.
 *
 * La interfaz pública NO cambia: `ImportTransactionsModal` lo consume igual.
 *
 * La escritura atómica a Firestore sigue en `useImportTransactions`.
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import { useGeminiKey } from '../contexts/GeminiKeyContext';
import { useAuth } from './useAuth';
import { useImportTransactions, type ImportRow } from './useImportTransactions';
import { useImportParsing } from './useImportParsing';
import { useImportAI } from './useImportAI';
import { useImportDedup } from './useImportDedup';
import { useLocalStorage } from './useLocalStorage';
import { isInternalTransferDescription } from '../utils/csvParser';
import {
  findLearnedCategory,
  upsertImportLearningRule,
  type ImportLearningRule,
} from '../utils/importLearning';
import { CREDIT_PAYMENT_CATEGORY, DEFAULT_CATEGORIES } from '../config/constants';
import type { Account, Categories, Transaction } from '../types/finance';
import type { WizardStep, AISuggestion } from '../types/import';

// ─── Constants ──────────────────────────────────────────────────────────────

const FALLBACK_CATEGORIES = [
  ...new Set([...DEFAULT_CATEGORIES.expense, ...DEFAULT_CATEGORIES.income, CREDIT_PAYMENT_CATEGORY]),
];

const categoryCollator = new Intl.Collator('es-CO', { sensitivity: 'base' });

// ─── Pure function: inferTransferRoute ──────────────────────────────────────

/**
 * Determina accountId y toAccountId según si la fila es una transferencia interna.
 * Si es transferencia y hay una sola tarjeta de crédito vinculada, la ruta es
 * baseAccount → creditCard. Si la base es credit con bankAccountId, invierte la ruta.
 */
export function inferTransferRoute(
  baseAccountId: string,
  isInternalTransfer: boolean,
  accounts: Account[]
): { accountId: string; toAccountId?: string } {
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
}

// ─── Pure function: routeRows ───────────────────────────────────────────────

/**
 * Función pura que asigna accountId, toAccountId y categoría aprendida a cada fila.
 * Se ejecuta después del parse y antes del dedup en el pipeline.
 */
export function routeRows(
  rows: ImportRow[],
  baseAccountId: string,
  learningRules: ImportLearningRule[],
  accounts: Account[],
  categoryOptions: string[]
): ImportRow[] {
  return rows.map(row => {
    const isTransfer = row.type === 'transfer' || isInternalTransferDescription(row.description);
    const { accountId, toAccountId } = inferTransferRoute(baseAccountId, isTransfer, accounts);
    const learnedCategory = row.categorySource === 'file'
      ? null
      : findLearnedCategory(row.description, learningRules, categoryOptions);
    return {
      ...row,
      accountId,
      toAccountId,
      category: learnedCategory ?? row.suggestedCategory ?? row.category,
    };
  });
}

// ─── Hook interface ─────────────────────────────────────────────────────────

export interface UseImportWizardArgs {
  accounts: Account[];
  existingTransactions: Transaction[];
  categories: Categories;
  onClose: () => void;
}

// ─── Hook implementation ────────────────────────────────────────────────────

export function useImportWizard({ accounts, existingTransactions, categories, onClose }: UseImportWizardArgs) {
  const { isConfigured: aiKeyConfigured, hasConsent: aiHasConsent } = useGeminiKey();
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

  // ─── Delegate to sub-hooks ──────────────────────────────────────────────

  const parsing = useImportParsing({ categories, aiReason });
  const {
    fileName, parseError, parseStats: parsingStats, pdfParsing, pdfNeedsAI,
    fileInputRef, parseFile, resetParsing,
  } = parsing;

  const ai = useImportAI({
    availableCategoryOptions,
    learningRules,
    setLearningRules,
  });
  const {
    aiCategorizing, aiApplied, aiSuggestions, aiNoSuggestions,
    aiSuggestionTransactionCount, aiSuggestionsByCategory,
    handleAICategorize: aiCategorize,
    handleApplyAISuggestions: aiApply,
    handleSuggestionCategoryChange,
    handleDiscardAISuggestions,
  } = ai;

  const dedup = useImportDedup({ existingTransactions });
  const { markDuplicates } = dedup;

  // ─── Parse stats: merge with dedup counts ─────────────────────────────

  const parseStats = useMemo(() => {
    if (!parsingStats) return null;
    const duplicateCount = rows.filter(r => r.isDuplicate).length;
    return { ...parsingStats, duplicates: duplicateCount };
  }, [parsingStats, rows]);

  // ─── Pipeline handlers ────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    setStep('upload');
    setRows([]);
    setSelectedAccountId('');
    resetParsing();
    reset();
    onClose();
  }, [onClose, reset, resetParsing]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. PARSE
    const parsedRows = await parseFile(file);
    if (parsedRows.length === 0) return;

    // Resolve account
    const accountId = selectedAccountId || nonCreditAccounts[0]?.id || accounts[0]?.id || '';
    if (!selectedAccountId && accountId) {
      setSelectedAccountId(accountId);
    }

    // 2. ROUTE
    const routed = routeRows(parsedRows, accountId, learningRules, accounts, availableCategoryOptions);

    // 3. DEDUP
    const deduped = markDuplicates(routed, accountId);

    // 4. STATE
    setRows(deduped);
  }, [
    selectedAccountId,
    accounts,
    nonCreditAccounts,
    learningRules,
    availableCategoryOptions,
    parseFile,
    markDuplicates,
  ]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    if (fileInputRef.current) {
      fileInputRef.current.files = dt.files;
      fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, [fileInputRef]);

  // handleAccountChange: re-executes route + dedup without re-parsing
  const handleAccountChange = useCallback((accountId: string) => {
    setSelectedAccountId(accountId);
    setRows(prev => {
      const rerouted = routeRows(prev, accountId, learningRules, accounts, availableCategoryOptions);
      return markDuplicates(rerouted, accountId);
    });
  }, [learningRules, accounts, availableCategoryOptions, markDuplicates]);

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
    }
    setRows(prev => prev.map((r, i) => i === index ? { ...r, category } : r));
  }, [rows, setLearningRules]);

  const handleTypeChange = useCallback((index: number, type: 'income' | 'expense' | 'transfer') => {
    setRows(prev => prev.map((r, i) => {
      if (i !== index) return r;
      const { accountId, toAccountId } = inferTransferRoute(r.accountId, type === 'transfer', accounts);
      return { ...r, type, accountId, toAccountId };
    }));
  }, [accounts]);

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

  const importingRef = useRef(false);
  const handleImport = useCallback(async () => {
    if (importingRef.current) return;
    importingRef.current = true;
    try {
      await importTransactions(rows);
      setStep('done');
    } finally {
      importingRef.current = false;
    }
  }, [importTransactions, rows]);

  // AI handlers — delegate to useImportAI, but wire into local rows state
  const handleAICategorize = useCallback(async () => {
    await aiCategorize(rows);
  }, [aiCategorize, rows]);

  const handleApplyAISuggestions = useCallback(() => {
    const updatedRows = aiApply(rows);
    setRows(updatedRows);
  }, [aiApply, rows]);

  const includedCount = rows.filter(r => r.include).length;

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
    aiNoSuggestions,
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
