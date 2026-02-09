/**
 * 🟢 Selector de rango de fechas
 * 
 * Componente para seleccionar filtros de fecha en transacciones y estadísticas
 */

import React, { useState } from 'react';
import { Calendar, X } from 'lucide-react';
import type { DateRangePreset } from '../../types/finance';

interface DateRangePickerProps {
  preset: DateRangePreset;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomRange?: (startDate: Date, endDate: Date) => void;
  onClear: () => void;
  label?: string;
}

const presetOptions: { value: DateRangePreset; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'today', label: 'Hoy' },
  { value: 'this-week', label: 'Esta semana' },
  { value: 'this-month', label: 'Este mes' },
  { value: 'last-month', label: 'Mes pasado' },
  { value: 'this-year', label: 'Este año' },
  { value: 'last-year', label: 'Año pasado' },
  { value: 'custom', label: 'Personalizado' }
];

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  preset,
  onPresetChange,
  onCustomRange,
  onClear,
  label = 'Período'
}) => {
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const handlePresetChange = (value: string) => {
    const newPreset = value as DateRangePreset;
    onPresetChange(newPreset);
    
    if (newPreset === 'custom') {
      setShowCustom(true);
    } else {
      setShowCustom(false);
      setCustomStart('');
      setCustomEnd('');
    }
  };

  const handleCustomApply = () => {
    if (customStart && customEnd && onCustomRange) {
      try {
        const startDate = new Date(customStart);
        const endDate = new Date(customEnd);
        
        if (startDate > endDate) {
          alert('La fecha de inicio debe ser anterior a la fecha final');
          return;
        }
        
        onCustomRange(startDate, endDate);
        setShowCustom(false);
      } catch (error) {
        alert('Fechas inválidas');
      }
    }
  };

  const handleClear = () => {
    onClear();
    setShowCustom(false);
    setCustomStart('');
    setCustomEnd('');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Calendar size={18} className="text-gray-500 dark:text-gray-400" aria-hidden="true" />
        <label htmlFor="date-range-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      </div>

      <div className="flex gap-2">
        <select
          id="date-range-select"
          value={preset}
          onChange={(e) => handlePresetChange(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
          aria-label="Seleccionar rango de fechas"
        >
          {presetOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {preset !== 'all' && (
          <button
            onClick={handleClear}
            className="px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            aria-label="Limpiar filtro de fecha"
            title="Limpiar filtro"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Custom date range inputs */}
      {showCustom && (
        <div 
          className="space-y-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700"
          role="region"
          aria-label="Rango de fechas personalizado"
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label 
                htmlFor="custom-start-date"
                className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
              >
                Desde
              </label>
              <input
                id="custom-start-date"
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                aria-label="Fecha de inicio"
              />
            </div>
            <div>
              <label 
                htmlFor="custom-end-date"
                className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
              >
                Hasta
              </label>
              <input
                id="custom-end-date"
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                aria-label="Fecha de fin"
              />
            </div>
          </div>
          <button
            onClick={handleCustomApply}
            disabled={!customStart || !customEnd}
            className="w-full px-3 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
            aria-label="Aplicar rango personalizado"
          >
            Aplicar rango
          </button>
        </div>
      )}
    </div>
  );
};
