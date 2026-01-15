import { useCallback } from 'react';
import { showToast } from '../utils/toastHelpers';
import type { Transaction, Account, Categories } from '../types/finance';

interface UseBackupProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: Categories;
}

/**
 * Hook para exportar datos de la aplicación
 * 
 * NOTA: La función de importación fue removida temporalmente porque
 * requiere implementación de batch writes a Firebase para funcionar
 * correctamente. El export funciona sin problemas.
 * 
 * TODO: Implementar importación con:
 * - Batch writes a Firestore
 * - Manejo de conflictos (merge vs replace)
 * - Validación de integridad referencial
 */
export const useBackup = ({ transactions, accounts, categories }: UseBackupProps) => {
  const exportData = useCallback((): void => {
    const data = {
      transactions,
      accounts,
      categories,
      exportDate: new Date().toISOString(),
      version: '1.0'
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moneytrack_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [transactions, accounts, categories]);

  return { exportData };
};