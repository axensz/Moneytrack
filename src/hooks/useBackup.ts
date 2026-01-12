import { useCallback } from 'react';
import { showToast } from '../utils/toastHelpers';
import { SUCCESS_MESSAGES } from '../config/constants';
import type { Transaction, Account, Categories } from '../types/finance';

interface UseBackupProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: Categories;
}

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

  const importData = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        const result = e.target?.result;
        if (typeof result !== 'string') return;
        
        const data = JSON.parse(result);
        
        if (!data || typeof data !== 'object') {
          throw new Error('Formato de archivo inválido');
        }
        
        if (data.transactions) {
          if (!Array.isArray(data.transactions)) {
            throw new Error('Las transacciones deben ser un array');
          }
          
          const invalidTx = data.transactions.find((t: any) => 
            !t.id || !t.type || typeof t.amount !== 'number' ||
            !['income', 'expense', 'transfer'].includes(t.type)
          );
          
          if (invalidTx) {
            throw new Error('Transacción inválida encontrada');
          }
        }
        
        if (data.accounts) {
          if (!Array.isArray(data.accounts)) {
            throw new Error('Las cuentas deben ser un array');
          }
          
          const invalidAcc = data.accounts.find((a: any) => 
            !a.id || !a.name || !a.type ||
            !['savings', 'credit', 'cash'].includes(a.type)
          );
          
          if (invalidAcc) {
            throw new Error('Cuenta inválida encontrada');
          }
        }
        
        showToast.success(SUCCESS_MESSAGES.DATA_IMPORTED);
      } catch (error) {
        showToast.error(`Error al importar: ${(error as Error).message}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }, []);

  return { exportData, importData };
};