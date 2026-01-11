import Dexie, { Table } from 'dexie';
import type { Transaction, Account, Category } from '../types/finance';

export class MoneyTrackDB extends Dexie {
  transactions!: Table<Transaction>;
  accounts!: Table<Account>;
  categories!: Table<Category>;

  constructor() {
    super('MoneyTrackDB');
    
    this.version(1).stores({
      transactions: '++id, type, amount, category, description, date, paid, accountId, toAccountId, [accountId+date], [category+date]',
      accounts: '++id, name, type, initialBalance, creditLimit, isDefault',
      categories: '++id, type, name'
    });
  }
}

export const db = new MoneyTrackDB();