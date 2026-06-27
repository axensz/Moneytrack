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

/** Color de estado para el % de confianza: alto = éxito, medio = aviso. */
function confidenceClass(confidence: number): string {
  if (confidence >= 0.9) return 'text-success';
  if (confidence >= 0.8) return 'text-warning';
  return 'text-muted-foreground';
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
    <div className="p-3 bg-primary/10 rounded-xl border border-border-accent space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Sparkles size={14} className="text-primary mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-foreground">
              Sugerencias por comercio
            </p>
            <p className="text-[11px] text-muted-foreground">
              {suggestions.length} grupos para {transactionCount} movimientos
            </p>
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={onDiscard}
            className="text-xs px-2.5 py-1 rounded-lg bg-card text-muted-foreground border border-border hover:bg-muted transition-colors"
          >
            Descartar
          </button>
          <button
            onClick={onApply}
            className="text-xs px-2.5 py-1 rounded-lg bg-primary-solid text-white font-medium hover:opacity-90 transition-opacity"
          >
            Aplicar
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
        {byCategory.map(group => (
          <div key={group.category} className="space-y-1.5">
            <div className="text-[11px] font-semibold text-primary">
              {group.category}
            </div>
            {group.suggestions.map(suggestion => (
              <div
                key={suggestion.id}
                className="grid grid-cols-[1fr_auto] gap-2 items-center p-2 rounded-lg bg-card border border-border"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-semibold text-foreground truncate">
                      {suggestion.pattern.toUpperCase()}
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {suggestion.indexes.length} movimientos
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate" title={suggestion.sampleDescription}>
                    {suggestion.sampleDescription}
                    {' · '}
                    <span className={`font-medium ${confidenceClass(suggestion.confidence)}`}>
                      {Math.round(suggestion.confidence * 100)}%
                    </span>
                  </p>
                </div>
                <select
                  value={suggestion.category}
                  onChange={e => onSuggestionCategoryChange(suggestion.id, e.target.value)}
                  className="select-filter text-[11px] !min-h-0 !px-2 !py-1 max-w-[150px]"
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
