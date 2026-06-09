'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, Sparkles, Loader2 } from 'lucide-react';
import type { DateRangePreset } from '../../../../types/finance';
import { DATE_PRESETS } from '../../../../utils/dateUtils';
import { isGeminiConfigured } from '../../../../lib/gemini';
import { getGeminiClient, isAiEnabled } from '../../../../lib/geminiClient';

interface DateFilterDropdownProps {
  dateRangePreset: DateRangePreset;
  setDateRangePreset: (preset: DateRangePreset) => void;
  customStartDate: string;
  setCustomStartDate: (date: string) => void;
  customEndDate: string;
  setCustomEndDate: (date: string) => void;
  showDatePicker: boolean;
  setShowDatePicker: (show: boolean) => void;
}

async function parseDateWithAI(query: string): Promise<{ startDate: string; endDate: string } | null> {
  if (!isAiEnabled()) return null;

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const dayOfWeek = today.toLocaleDateString('es-CO', { weekday: 'long' });

  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Hoy es ${dayOfWeek} ${todayStr}. El usuario quiere filtrar por rango de fechas y dice: "${query}". Responde SOLO un JSON con formato {"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"}. Sin explicaciones.`,
    config: { temperature: 0 },
  });

  const text = response.text?.trim() || '';
  const jsonMatch = text.match(/\{[^}]+\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.startDate && parsed.endDate) return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * Dropdown para filtrar transacciones por rango de fecha
 */
export const DateFilterDropdown: React.FC<DateFilterDropdownProps> = ({
  dateRangePreset,
  setDateRangePreset,
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
  showDatePicker,
  setShowDatePicker,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [aiQuery, setAiQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    }

    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDatePicker, setShowDatePicker]);

  const handleAIDateParse = async () => {
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    setAiError('');

    try {
      const result = await parseDateWithAI(aiQuery.trim());
      if (result) {
        setDateRangePreset('custom');
        setCustomStartDate(result.startDate);
        setCustomEndDate(result.endDate);
        setAiQuery('');
        setShowDatePicker(false);
      } else {
        setAiError('No pude interpretar las fechas. Intenta de otra forma.');
      }
    } catch {
      setAiError('Error al consultar la IA. Intenta de nuevo.');
    } finally {
      setAiLoading(false);
    }
  };

  const currentLabel =
    DATE_PRESETS.find((p) => p.value === dateRangePreset)?.label || 'Fecha';

  return (
    <div
      className="relative"
      ref={dropdownRef}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && showDatePicker) {
          e.stopPropagation();
          setShowDatePicker(false);
        }
      }}
    >
      <button
        onClick={() => setShowDatePicker(!showDatePicker)}
        aria-haspopup="dialog"
        aria-expanded={showDatePicker}
        className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors flex-shrink-0 ${dateRangePreset !== 'all'
          ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
          }`}
      >
        <Calendar size={16} />
        <span className="truncate max-w-[50px] sm:max-w-[80px]">{currentLabel === 'Todo el tiempo' ? 'Fecha' : currentLabel}</span>
        <ChevronDown size={14} className="flex-shrink-0" />
      </button>

      {showDatePicker && (
        <div role="dialog" aria-label="Filtrar por fecha" className="absolute top-full right-0 mt-1 z-[100] bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-2 min-w-[240px] max-w-[calc(100vw-2rem)]">
          {/* AI date input */}
          {isGeminiConfigured() && (
            <div className="mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAIDateParse()}
                  placeholder="Ej: desde el lunes pasado hasta hoy"
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                  disabled={aiLoading}
                />
                <button
                  onClick={handleAIDateParse}
                  disabled={aiLoading || !aiQuery.trim()}
                  className="flex items-center justify-center px-2 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
                  title="Interpretar con IA"
                >
                  {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                </button>
              </div>
              {aiError && <p className="text-[10px] text-rose-500 mt-1">{aiError}</p>}
            </div>
          )}

          <div className="space-y-0.5">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => {
                  setDateRangePreset(preset.value);
                  if (preset.value !== 'custom') setShowDatePicker(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${dateRangePreset === preset.value
                  ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Campos de fecha personalizada */}
          {dateRangePreset === 'custom' && (
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Desde</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Hasta</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <button
                onClick={() => setShowDatePicker(false)}
                className="w-full py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
              >
                Aplicar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
