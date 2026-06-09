'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import type { AISuggestion } from '../../../types/import';

interface AISuggestionsPanelProps {
  suggestions: AISuggestion[];
  transactionCount: number;
  byCategory: { category: string; suggestions: AISuggestion[] }[];
  categoryOptions: string[];
  onSuggestionCategoryChange: (suggestionId: string, category: string) => void;
  onApply: () => void;
  onDiscard: () => void;
}

/** Panel de sugerencias de categorización por IA, agrupadas por comercio. */
export function AISuggestionsPanel({
  suggestions,
  transactionCount,
  byCategory,
  categoryOptions,
  onSuggestionCategoryChange,
  onApply,
  onDiscard,
}: AISuggestionsPanelProps) {
  return (
    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800/60 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Sparkles size={14} className="text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">
              Sugerencias por comercio
            </p>
            <p className="text-[11px] text-blue-600 dark:text-blue-300">
              {suggestions.length} grupos cubren {transactionCount} transacciones
            </p>
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={onDiscard}
            className="text-xs px-2.5 py-1 rounded-lg bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-blue-100 dark:border-blue-800 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Descartar
          </button>
          <button
            onClick={onApply}
            className="text-xs px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
          >
            Aplicar
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
        {byCategory.map(group => (
          <div key={group.category} className="space-y-1.5">
            <div className="text-[11px] font-semibold text-blue-900 dark:text-blue-100">
              {group.category}
            </div>
            {group.suggestions.map(suggestion => (
              <div
                key={suggestion.id}
                className="grid grid-cols-[1fr_auto] gap-2 items-center p-2 rounded-lg bg-white/80 dark:bg-gray-900/50 border border-blue-100 dark:border-blue-900/60"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">
                      {suggestion.pattern.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {suggestion.indexes.length} mov.
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 truncate" title={suggestion.sampleDescription}>
                    {suggestion.sampleDescription} · {Math.round(suggestion.confidence * 100)}%
                  </p>
                </div>
                <select
                  value={suggestion.category}
                  onChange={e => onSuggestionCategoryChange(suggestion.id, e.target.value)}
                  className="text-[11px] px-2 py-1 border border-blue-100 dark:border-blue-800 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[150px]"
                >
                  {categoryOptions.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
