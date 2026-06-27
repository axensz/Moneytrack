'use client';

import React from 'react';
import { ChevronDown, Loader2, ToggleLeft, ToggleRight, Sparkles, Calendar } from 'lucide-react';
import { isAIAvailable } from '../../../utils/aiCategorizer';
import { formatCurrency } from '../../../utils/formatters';
import { AISuggestionsPanel } from './AISuggestionsPanel';
import type { ImportRow } from '../../../hooks/useImportTransactions';
import type { AISuggestion } from '../../../types/import';

interface ImportReviewStepProps {
  rows: ImportRow[];
  setRows: React.Dispatch<React.SetStateAction<ImportRow[]>>;
  includedCount: number;
  availableCategoryOptions: string[];
  aiCategorizing: boolean;
  aiApplied: boolean;
  aiSuggestions: AISuggestion[];
  aiNoSuggestions: boolean;
  aiSuggestionTransactionCount: number;
  aiSuggestionsByCategory: { category: string; suggestions: AISuggestion[] }[];
  aiUnavailableMessage: string;
  onToggleRow: (index: number) => void;
  onToggleAll: (include: boolean) => void;
  onCategoryChange: (index: number, category: string) => void;
  onTypeChange: (index: number, type: 'income' | 'expense' | 'transfer') => void;
  onAICategorize: () => void;
  onSuggestionCategoryChange: (suggestionId: string, category: string) => void;
  onApplyAISuggestions: () => void;
  onDiscardAISuggestions: () => void;
  onOpenAISettings?: () => void;
}

/** Paso 2 del wizard: revisar/editar las transacciones a importar. */
export function ImportReviewStep({
  rows,
  setRows,
  includedCount,
  availableCategoryOptions,
  aiCategorizing,
  aiApplied,
  aiSuggestions,
  aiNoSuggestions,
  aiSuggestionTransactionCount,
  aiSuggestionsByCategory,
  aiUnavailableMessage,
  onToggleRow,
  onToggleAll,
  onCategoryChange,
  onTypeChange,
  onAICategorize,
  onSuggestionCategoryChange,
  onApplyAISuggestions,
  onDiscardAISuggestions,
  onOpenAISettings,
}: ImportReviewStepProps) {
  return (
    <div className="space-y-3">
      {/* Controles bulk */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onToggleAll(true)} className="text-xs px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 transition-colors">
            Todas
          </button>
          <button onClick={() => onToggleAll(false)} className="text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
            Ninguna
          </button>
          {isAIAvailable() && (
            <button
              onClick={onAICategorize}
              disabled={aiCategorizing || includedCount === 0}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary-solid text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aiCategorizing ? (
                <><Loader2 size={12} className="animate-spin" /> Analizando...</>
              ) : (
                <><Sparkles size={12} /> {aiSuggestions.length > 0 ? 'Actualizar sugerencias' : aiApplied ? 'Re-categorizar con IA' : 'Categorizar con IA'}</>
              )}
            </button>
          )}
          {!isAIAvailable() && onOpenAISettings && (
            <button
              onClick={onOpenAISettings}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-primary/40 text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
              title={aiUnavailableMessage}
            >
              <Sparkles size={12} /> Activar IA para categorizar
            </button>
          )}
        </div>
        <span className="text-xs text-gray-500">
          {includedCount} seleccionadas
          {rows.filter(r => r.isDuplicate).length > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              {' · '}{rows.filter(r => r.isDuplicate).length} duplicados
            </span>
          )}
        </span>
      </div>

      {/* Ajuste masivo de año */}
      <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
        <Calendar size={14} className="text-gray-400 flex-shrink-0" />
        <span className="text-xs text-gray-600 dark:text-gray-400">Ajustar año:</span>
        <select
          onChange={(e) => {
            const targetYear = parseInt(e.target.value);
            if (!targetYear) return;
            setRows(prev => prev.map(r => {
              const d = new Date(r.date);
              d.setFullYear(targetYear);
              return { ...r, date: d };
            }));
          }}
          className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500"
          defaultValue=""
        >
          <option value="" disabled>Cambiar todas a...</option>
          <option value="2024">2024</option>
          <option value="2025">2025</option>
          <option value="2026">2026</option>
        </select>
        <span className="text-[10px] text-gray-400">o edita individual</span>
      </div>

      {aiApplied && (
        <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg text-xs text-primary">
          <Sparkles size={12} />
          Categorías actualizadas con IA. Revisa y ajusta si es necesario.
        </div>
      )}

      {aiNoSuggestions && aiSuggestions.length === 0 && (
        <div className="flex items-start gap-2 p-2 bg-muted rounded-lg text-xs text-muted-foreground">
          <Sparkles size={12} className="text-primary mt-0.5 shrink-0" />
          <span>La IA no encontró categorías con suficiente confianza. Revisa y ajusta las categorías manualmente.</span>
        </div>
      )}

      {aiSuggestions.length > 0 && (
        <AISuggestionsPanel
          suggestions={aiSuggestions}
          transactionCount={aiSuggestionTransactionCount}
          byCategory={aiSuggestionsByCategory}
          categoryOptions={availableCategoryOptions}
          onSuggestionCategoryChange={onSuggestionCategoryChange}
          onApply={onApplyAISuggestions}
          onDiscard={onDiscardAISuggestions}
        />
      )}

      {/* Tabla de transacciones */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* S15: tabla visible solo en sm+ para evitar scroll horizontal en 320-375px */}
        <div className="hidden sm:block overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm min-w-[540px]">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 z-10">
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th scope="col" className="w-8 py-2 px-3 text-center"></th>
                <th scope="col" className="py-2 px-3 text-left font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Fecha</th>
                <th scope="col" className="py-2 px-3 text-left font-semibold text-gray-600 dark:text-gray-400">Descripción</th>
                <th scope="col" className="py-2 px-3 text-left font-semibold text-gray-600 dark:text-gray-400">Categoría</th>
                <th scope="col" className="py-2 px-3 text-center font-semibold text-gray-600 dark:text-gray-400">Tipo</th>
                <th scope="col" className="py-2 px-3 text-right font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className={`transition-colors ${!row.include ? 'opacity-40' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                >
                  {/* Toggle incluir */}
                  <td className="py-2 px-3 text-center">
                    <button onClick={() => onToggleRow(i)} className="text-gray-400 hover:text-purple-600 transition-colors">
                      {row.include
                        ? <ToggleRight size={18} className="text-purple-600" />
                        : <ToggleLeft size={18} />}
                    </button>
                  </td>

                  {/* Fecha - editable */}
                  <td className="py-2 px-3 whitespace-nowrap">
                    <input
                      type="date"
                      value={row.date.toISOString().split('T')[0]}
                      onChange={(e) => {
                        const newDate = new Date(e.target.value + 'T12:00:00');
                        if (!isNaN(newDate.getTime())) {
                          setRows(prev => prev.map((r, idx) => idx === i ? { ...r, date: newDate } : r));
                        }
                      }}
                      disabled={!row.include}
                      className="text-xs px-1.5 py-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500 w-[120px]"
                    />
                  </td>

                  {/* Descripción */}
                  <td className="py-2 px-3 text-gray-700 dark:text-gray-300 max-w-[200px]">
                    <span className="block truncate text-xs" title={row.description}>{row.description}</span>
                    {row.isDuplicate && (
                      <span className="inline-block text-[10px] px-1.5 py-0.5 mt-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded font-medium">
                        duplicado
                      </span>
                    )}
                  </td>

                  {/* Categoría */}
                  <td className="py-2 px-3">
                    <div className="relative">
                      <select
                        value={row.category}
                        onChange={e => onCategoryChange(i, e.target.value)}
                        className="text-xs pl-2 pr-6 py-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 appearance-none focus:outline-none focus:ring-1 focus:ring-purple-500 w-full"
                        disabled={!row.include}
                      >
                        {availableCategoryOptions.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </td>

                  {/* Tipo ingreso/gasto */}
                  <td className="py-2 px-3">
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => onTypeChange(i, 'expense')}
                        disabled={!row.include}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${row.type === 'expense' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                      >
                        Gasto
                      </button>
                      <button
                        onClick={() => onTypeChange(i, 'income')}
                        disabled={!row.include}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${row.type === 'income' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                      >
                        Ingreso
                      </button>
                      <button
                        onClick={() => onTypeChange(i, 'transfer')}
                        disabled={!row.include}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${row.type === 'transfer' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                      >
                        Transferencia
                      </button>
                    </div>
                  </td>

                  {/* Monto */}
                  <td className={`py-2 px-3 text-right font-semibold text-xs whitespace-nowrap ${row.type === 'income' ? 'text-green-600 dark:text-green-400' : row.type === 'transfer' ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                    {row.type === 'income' ? '+' : row.type === 'transfer' ? '' : '-'}
                    {formatCurrency(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* S15: Layout en tarjetas para móvil (<sm) — sin scroll horizontal */}
        <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-800 max-h-[50vh] overflow-y-auto">
          {rows.map((row, i) => {
            const amountColor =
              row.type === 'income'
                ? 'text-green-600 dark:text-green-400'
                : row.type === 'transfer'
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-red-600 dark:text-red-400';
            const amountSign =
              row.type === 'income' ? '+' : row.type === 'transfer' ? '' : '-';
            return (
              <div
                key={i}
                className={`p-3 transition-colors ${!row.include ? 'opacity-40' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
              >
                {/* Fila 1: toggle + descripción + monto */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button
                      onClick={() => onToggleRow(i)}
                      aria-label={row.include ? 'Excluir transacción' : 'Incluir transacción'}
                      className="flex-shrink-0 text-gray-400 hover:text-purple-600 transition-colors"
                    >
                      {row.include
                        ? <ToggleRight size={16} className="text-purple-600" />
                        : <ToggleLeft size={16} />}
                    </button>
                    <div className="min-w-0">
                      <span
                        className="block text-xs font-medium text-gray-800 dark:text-gray-200 truncate"
                        title={row.description}
                      >
                        {row.description}
                      </span>
                      {row.isDuplicate && (
                        <span className="inline-block text-[10px] px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded font-medium">
                          duplicado
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs font-bold whitespace-nowrap flex-shrink-0 ${amountColor}`}>
                    {amountSign}{formatCurrency(row.amount)}
                  </span>
                </div>

                {/* Fila 2: fecha + categoría */}
                <div className="flex gap-2 mb-2">
                  <input
                    type="date"
                    value={row.date.toISOString().split('T')[0]}
                    onChange={(e) => {
                      const newDate = new Date(e.target.value + 'T12:00:00');
                      if (!isNaN(newDate.getTime())) {
                        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, date: newDate } : r));
                      }
                    }}
                    disabled={!row.include}
                    className="text-xs px-1.5 py-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500 w-[112px] flex-shrink-0"
                  />
                  <div className="flex-1 relative min-w-0">
                    <select
                      value={row.category}
                      onChange={e => onCategoryChange(i, e.target.value)}
                      className="text-xs pl-2 pr-6 py-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 appearance-none focus:outline-none focus:ring-1 focus:ring-purple-500 w-full"
                      disabled={!row.include}
                    >
                      {availableCategoryOptions.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Fila 3: tipo */}
                <div className="flex gap-1">
                  <button
                    onClick={() => onTypeChange(i, 'expense')}
                    disabled={!row.include}
                    className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${row.type === 'expense' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >
                    Gasto
                  </button>
                  <button
                    onClick={() => onTypeChange(i, 'income')}
                    disabled={!row.include}
                    className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${row.type === 'income' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >
                    Ingreso
                  </button>
                  <button
                    onClick={() => onTypeChange(i, 'transfer')}
                    disabled={!row.include}
                    className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${row.type === 'transfer' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >
                    Transferencia
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
