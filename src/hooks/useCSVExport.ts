/**
 * Hook para exportar datos a CSV
 * Genera archivos CSV compatibles con Excel y Google Sheets
 */

import { useCallback } from 'react';
import { showToast } from '../utils/toastHelpers';
import { logger } from '../utils/logger';
import type { Transaction, Account } from '../types/finance';

export function useCSVExport() {
  /**
   * Escapa un valor para CSV (maneja comas, comillas y saltos de línea)
   */
  const escapeCSV = useCallback((value: string | number | boolean | undefined): string => {
    if (value === undefined || value === null) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }, []);

  /**
   * Exporta transacciones a CSV
   */
  const exportTransactionsCSV = useCallback((
    transactions: Transaction[],
    accounts: Account[]
  ) => {
    try {
      const accountMap = new Map(accounts.map(a => [a.id, a.name]));

      const headers = [
        'Fecha',
        'Tipo',
        'Categoría',
        'Descripción',
        'Monto',
        'Cuenta',
        'Cuenta Destino',
        'Pagado',
        'Cuotas',
        'Cuota Mensual',
        'Total Intereses',
        'Tasa E.A.',
      ];

      const typeLabels: Record<string, string> = {
        income: 'Ingreso',
        expense: 'Gasto',
        transfer: 'Transferencia',
      };

      const rows = transactions.map(t => [
        escapeCSV(new Date(t.date).toLocaleDateString('es-CO')),
        escapeCSV(typeLabels[t.type] || t.type),
        escapeCSV(t.category),
        escapeCSV(t.description),
        escapeCSV(t.amount),
        escapeCSV(accountMap.get(t.accountId) || t.accountId),
        escapeCSV(t.toAccountId ? (accountMap.get(t.toAccountId) || t.toAccountId) : ''),
        escapeCSV(t.paid ? 'Sí' : 'No'),
        escapeCSV(t.installments || ''),
        escapeCSV(t.monthlyInstallmentAmount || ''),
        escapeCSV(t.totalInterestAmount || ''),
        escapeCSV(t.interestRate ? `${t.interestRate}%` : ''),
      ]);

      // BOM for UTF-8 Excel compatibility
      const BOM = '\uFEFF';
      const csv = BOM + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `moneytrack_transacciones_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast.success('CSV exportado correctamente');
      logger.info('CSV exported', { count: transactions.length });
    } catch (error) {
      logger.error('Error exporting CSV', error);
      showToast.error('Error al exportar CSV');
    }
  }, [escapeCSV]);

  return { exportTransactionsCSV };
}
