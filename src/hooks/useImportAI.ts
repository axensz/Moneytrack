'use client';

/**
 * useImportAI — lógica de categorización asistida por IA (Gemini) extraída
 * de `useImportWizard`. Filtra filas elegibles, invoca `categorizeWithAI`,
 * filtra por confianza ≥ 0.75, y expone sugerencias + handlers de aplicación.
 *
 * `handleApplyAISuggestions` retorna `ImportRow[]` inmutable (no muta estado
 * interno de filas), para que el orquestador controle cuándo actualiza su state.
 */

import { useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { categorizeWithAI } from '../utils/aiCategorizer';
import {
  groupImportRowsByPattern,
  upsertImportLearningRule,
  type ImportLearningRule,
} from '../utils/importLearning';
import { SPECIAL_CATEGORIES } from '../config/constants';
import type { ImportRow } from './useImportTransactions';
import type { AISuggestion } from '../types/import';

// ─── Helpers internos ───────────────────────────────────────────────────────

const categoryCollator = new Intl.Collator('es-CO', { sensitivity: 'base' });

const normalizeCategory = (category: string) =>
  category.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const isOtherCategory = (category: string) => normalizeCategory(category) === 'otros';

const isSpecialCategory = (category: string) =>
  SPECIAL_CATEGORIES.adjustmentCategories.some(
    item => normalizeCategory(item) === normalizeCategory(category)
  );

// ─── Interfaces públicas ────────────────────────────────────────────────────

export interface UseImportAIArgs {
  availableCategoryOptions: string[];
  learningRules: ImportLearningRule[];
  setLearningRules: (updater: (prev: ImportLearningRule[]) => ImportLearningRule[]) => void;
}

export interface UseImportAIReturn {
  aiCategorizing: boolean;
  aiApplied: boolean;
  aiSuggestions: AISuggestion[];
  /** true tras un análisis exitoso que no produjo sugerencias aplicables
   * (ninguna categoría con confianza suficiente). La UI muestra un aviso. */
  aiNoSuggestions: boolean;
  aiSuggestionTransactionCount: number;
  aiSuggestionsByCategory: { category: string; suggestions: AISuggestion[] }[];
  handleAICategorize: (rows: ImportRow[]) => Promise<void>;
  handleApplyAISuggestions: (rows: ImportRow[]) => ImportRow[];
  handleSuggestionCategoryChange: (suggestionId: string, category: string) => void;
  handleDiscardAISuggestions: () => void;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useImportAI({
  availableCategoryOptions,
  learningRules,
  setLearningRules,
}: UseImportAIArgs): UseImportAIReturn {
  const [aiCategorizing, setAiCategorizing] = useState(false);
  const [aiApplied, setAiApplied] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [aiNoSuggestions, setAiNoSuggestions] = useState(false);

  // ─── handleAICategorize ─────────────────────────────────────────────────

  const handleAICategorize = useCallback(async (rows: ImportRow[]) => {
    if (aiCategorizing || rows.length === 0) return;
    setAiCategorizing(true);
    setAiNoSuggestions(false);
    try {
      // 1. Filtrar filas elegibles: incluidas, no transferencia, sin categoría
      //    de archivo, categoría "Otros", y no categoría especial.
      const rowsForAI = rows
        .map((row, index) => ({ row, index }))
        .filter((item): item is { row: ImportRow & { type: 'income' | 'expense' }; index: number } =>
          item.row.include &&
          item.row.type !== 'transfer' &&
          item.row.categorySource !== 'file' &&
          isOtherCategory(item.row.category) &&
          !isSpecialCategory(item.row.category)
        );

      // 2. Agrupar por patrón de descripción.
      const groups = groupImportRowsByPattern(rowsForAI);
      const toAnalyze = groups.map((group, index) => ({
        index,
        description: `${group.pattern}: ${group.sample.description}`,
        amount: group.sample.amount,
        type: group.sample.type,
        currentCategory: group.sample.category,
      }));

      // 3. Invocar IA.
      const results = await categorizeWithAI(toAnalyze);

      // 4. Filtrar por confianza ≥ 0.75 y categoría no "Otros".
      const applicableResults = results.filter(
        r => r.confidence >= 0.75 && !isOtherCategory(r.category)
      );

      // 5. Mapear a AISuggestion y ordenar por categoría → patrón (es-CO).
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
        .sort(
          (a, b) =>
            categoryCollator.compare(a.category, b.category) ||
            categoryCollator.compare(a.pattern, b.pattern)
        );

      setAiSuggestions(suggestions);
      // Éxito sin sugerencias aplicables: la IA no encontró categorías con
      // confianza suficiente. Exponemos un estado vacío para que la UI lo avise.
      setAiNoSuggestions(suggestions.length === 0);
    } catch (error) {
      // Nunca fallar en silencio: las filas quedan con su categorización por
      // keyword, pero el usuario debe saber que la IA no respondió.
      console.error('[useImportAI] Falló la categorización con IA:', error);
      setAiSuggestions([]);
      setAiNoSuggestions(false);
      toast.error('No pudimos contactar a la IA. Revisa tu conexión o tu API key.');
    } finally {
      setAiCategorizing(false);
    }
  }, [aiCategorizing]);

  // ─── handleApplyAISuggestions ──────────────────────────────────────────
  // Retorna ImportRow[] nuevo (inmutable). No muta estado interno de filas.
  // El orquestador decide cuándo aplicar el resultado a su estado.

  const handleApplyAISuggestions = useCallback((rows: ImportRow[]): ImportRow[] => {
    if (aiSuggestions.length === 0) return rows;

    // Construir mapa de índice → categoría sugerida
    const categoryByIndex = new Map<number, string>();
    aiSuggestions.forEach(suggestion => {
      suggestion.indexes.forEach(rowIndex => {
        categoryByIndex.set(rowIndex, suggestion.category);
      });
    });

    // Aplicar sugerencias inmutablemente
    const updatedRows = rows.map((row, index) => {
      const suggestedCategory = categoryByIndex.get(index);
      return suggestedCategory ? { ...row, category: suggestedCategory } : row;
    });

    // Persistir reglas de aprendizaje
    setLearningRules(prev =>
      aiSuggestions.reduce(
        (acc, suggestion) => upsertImportLearningRule(acc, suggestion.sampleDescription, suggestion.category),
        prev
      )
    );

    // Limpiar sugerencias y marcar como aplicadas
    setAiSuggestions([]);
    setAiApplied(true);

    return updatedRows;
  }, [aiSuggestions, setLearningRules]);

  // ─── handleSuggestionCategoryChange ────────────────────────────────────

  const handleSuggestionCategoryChange = useCallback((suggestionId: string, category: string) => {
    setAiSuggestions(prev =>
      prev.map(suggestion =>
        suggestion.id === suggestionId ? { ...suggestion, category } : suggestion
      )
    );
  }, []);

  // ─── handleDiscardAISuggestions ────────────────────────────────────────

  const handleDiscardAISuggestions = useCallback(() => {
    setAiSuggestions([]);
    setAiNoSuggestions(false);
  }, []);

  // ─── Computed values ───────────────────────────────────────────────────

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
    aiCategorizing,
    aiApplied,
    aiSuggestions,
    aiNoSuggestions,
    aiSuggestionTransactionCount,
    aiSuggestionsByCategory,
    handleAICategorize,
    handleApplyAISuggestions,
    handleSuggestionCategoryChange,
    handleDiscardAISuggestions,
  };
}
