import { Transaction } from '../types';

class TransactionService {
  private static instance: TransactionService;
  
  static getInstance(): TransactionService {
    if (!TransactionService.instance) {
      TransactionService.instance = new TransactionService();
    }
    return TransactionService.instance;
  }

  async saveTransaction(transaction: Transaction): Promise<void> {
    // Simular API call
    await new Promise(resolve => setTimeout(resolve, 500));
    const transactions = this.getStoredTransactions();
    transactions.push(transaction);
    localStorage.setItem('transactions', JSON.stringify(transactions));
  }

  getStoredTransactions(): Transaction[] {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem('transactions');
    return stored ? JSON.parse(stored) : [];
  }

  async deleteTransaction(id: string): Promise<void> {
    const transactions = this.getStoredTransactions();
    const filtered = transactions.filter(t => t.id !== id);
    localStorage.setItem('transactions', JSON.stringify(filtered));
  }
}

export const transactionService = TransactionService.getInstance();