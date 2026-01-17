'use client';

import React, { useEffect, useRef } from 'react';
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
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const currentLabel =
    DATE_PRESETS.find((p) => p.value === dateRangePreset)?.label || 'Fecha';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDatePicker(!showDatePicker)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          dateRangePreset !== 'all'
            ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
        }`}
      >
        <Calendar size={16} />
        <span className="hidden sm:inline">{currentLabel}</span>
        <span className="sm:hidden">{currentLabel === 'Todo el tiempo' ? 'Fecha' : currentLabel}</span>
        <ChevronDown size={14} className="flex-shrink-0" />
      </button>

      {showDatePicker && (
        <div className="absolute top-full left-0 sm:left-auto sm:right-0 mt-1 z-20 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-2 min-w-[180px]">
          <div className="space-y-0.5">
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
