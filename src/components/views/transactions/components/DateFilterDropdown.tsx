'use client';

import React from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import type { DateRangePreset } from '../../../../types/finance';
import { DATE_PRESETS } from '../utils/dateUtils';

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
  const currentLabel =
    DATE_PRESETS.find((p) => p.value === dateRangePreset)?.label || 'Fecha';

  return (
    <div className="relative">
      <button
        onClick={() => setShowDatePicker(!showDatePicker)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          dateRangePreset !== 'all'
            ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
        }`}
      >
        <Calendar size={16} />
        {currentLabel}
        <ChevronDown size={14} />
      </button>

      {showDatePicker && (
        <div className="absolute top-full right-0 mt-1 z-20 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-3 min-w-[200px]">
          <div className="space-y-1">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => {
                  setDateRangePreset(preset.value);
                  if (preset.value !== 'custom') setShowDatePicker(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  dateRangePreset === preset.value
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
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">
                  Desde
                </label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">
                  Hasta
                </label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
                />
              </div>
              <button
                onClick={() => setShowDatePicker(false)}
                className="w-full mt-2 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
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
