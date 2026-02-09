/**
 * 🟢 Hook para filtros de rango de fechas
 * 
 * CARACTERÍSTICAS:
 * ✅ Presets: hoy, semana, mes, año, etc.
 * ✅ Rango personalizado
 * ✅ Validación de fechas
 * ✅ Filtrado de transacciones
 */

import { useState, useMemo, useCallback } from 'react';
import type { DateRangePreset, DateRange, Transaction } from '../types/finance';

/**
 * Obtiene el rango de fechas según el preset seleccionado
 */
function getDateRangeFromPreset(preset: DateRangePreset): { startDate: Date; endDate: Date } | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'all':
      return null;

    case 'today':
      return {
        startDate: today,
        endDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
      };

    case 'this-week': {
      const dayOfWeek = now.getDay();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - dayOfWeek);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59);
      return { startDate: startOfWeek, endDate: endOfWeek };
    }

    case 'this-month':
      return {
        startDate: new Date(now.getFullYear(), now.getMonth(), 1),
        endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
      };

    case 'last-month': {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return {
        startDate: lastMonth,
        endDate: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
      };
    }

    case 'this-year':
      return {
        startDate: new Date(now.getFullYear(), 0, 1),
        endDate: new Date(now.getFullYear(), 11, 31, 23, 59, 59)
      };

    case 'last-year': {
      const lastYear = now.getFullYear() - 1;
      return {
        startDate: new Date(lastYear, 0, 1),
        endDate: new Date(lastYear, 11, 31, 23, 59, 59)
      };
    }

    case 'custom':
      return null; // Se manejará con startDate/endDate del estado

    default:
      return null;
  }
}

/**
 * Hook para manejar filtros de fecha
 */
export function useDateFilter() {
  const [dateRange, setDateRange] = useState<DateRange>({
    preset: 'all'
  });

  /**
   * Actualiza el preset de fecha
   */
  const setPreset = useCallback((preset: DateRangePreset) => {
    if (preset === 'custom') {
      setDateRange({ preset, startDate: undefined, endDate: undefined });
    } else {
      setDateRange({ preset });
    }
  }, []);

  /**
   * Establece un rango personalizado
   */
  const setCustomRange = useCallback((startDate: Date, endDate: Date) => {
    if (startDate > endDate) {
      throw new Error('La fecha de inicio debe ser anterior a la fecha final');
    }
    setDateRange({ preset: 'custom', startDate, endDate });
  }, []);

  /**
   * Limpia el filtro de fecha
   */
  const clearDateFilter = useCallback(() => {
    setDateRange({ preset: 'all' });
  }, []);

  /**
   * Obtiene el rango de fechas efectivo
   */
  const effectiveDateRange = useMemo(() => {
    if (dateRange.preset === 'custom') {
      if (!dateRange.startDate || !dateRange.endDate) {
        return null;
      }
      return { startDate: dateRange.startDate, endDate: dateRange.endDate };
    }
    return getDateRangeFromPreset(dateRange.preset);
  }, [dateRange]);

  /**
   * Filtra transacciones por el rango de fechas actual
   */
  const filterByDateRange = useCallback(
    (transactions: Transaction[]): Transaction[] => {
      if (!effectiveDateRange) {
        return transactions;
      }

      const { startDate, endDate } = effectiveDateRange;

      return transactions.filter(transaction => {
        const transactionDate = new Date(transaction.date);
        return transactionDate >= startDate && transactionDate <= endDate;
      });
    },
    [effectiveDateRange]
  );

  /**
   * Obtiene una etiqueta legible del rango actual
   */
  const dateRangeLabel = useMemo(() => {
    if (dateRange.preset === 'all') return 'Todas las fechas';
    if (dateRange.preset === 'today') return 'Hoy';
    if (dateRange.preset === 'this-week') return 'Esta semana';
    if (dateRange.preset === 'this-month') return 'Este mes';
    if (dateRange.preset === 'last-month') return 'Mes pasado';
    if (dateRange.preset === 'this-year') return 'Este año';
    if (dateRange.preset === 'last-year') return 'Año pasado';
    
    if (dateRange.preset === 'custom' && effectiveDateRange) {
      const { startDate, endDate } = effectiveDateRange;
      const formatDate = (date: Date) => date.toLocaleDateString('es-CO', { 
        day: '2-digit', 
        month: 'short',
        year: 'numeric'
      });
      return `${formatDate(startDate)} - ${formatDate(endDate)}`;
    }

    return 'Personalizado';
  }, [dateRange, effectiveDateRange]);

  return {
    dateRange,
    setPreset,
    setCustomRange,
    clearDateFilter,
    filterByDateRange,
    dateRangeLabel,
    effectiveDateRange
  };
}
