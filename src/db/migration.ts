import { db } from '../db/db';

export const migrateFromLocalStorage = async () => {
  try {
    // Verificar si ya hay datos en IndexedDB
    const existingTransactions = await db.transactions.count();
    if (existingTransactions > 0) {
      console.log('✅ IndexedDB ya tiene datos, saltando migración');
      return;
    }

    // Migrar transacciones
    const localTransactions = localStorage.getItem('financeData');
    if (localTransactions) {
      const transactions = JSON.parse(localTransactions);
      const migratedTransactions = transactions.map((t: any) => ({
        ...t,
        date: new Date(t.date),
        createdAt: new Date()
      }));
      await db.transactions.bulkAdd(migratedTransactions);
      console.log(`✅ Migradas ${transactions.length} transacciones`);
    }

    // Migrar cuentas
    const localAccounts = localStorage.getItem('financeAccounts');
    if (localAccounts) {
      const accounts = JSON.parse(localAccounts);
      const migratedAccounts = accounts.map((a: any) => ({
        ...a,
        createdAt: new Date(a.createdAt || new Date())
      }));
      await db.accounts.bulkAdd(migratedAccounts);
      console.log(`✅ Migradas ${accounts.length} cuentas`);
    }

    // Migrar categorías (si existen)
    const localCategories = localStorage.getItem('categories');
    if (localCategories) {
      const categories = JSON.parse(localCategories);
      const migratedCategories = [
        ...categories.expense.map((name: string) => ({ type: 'expense' as const, name })),
        ...categories.income.map((name: string) => ({ type: 'income' as const, name }))
      ];
      await db.categories.bulkAdd(migratedCategories);
      console.log(`✅ Migradas categorías`);
    }

    // Limpiar localStorage después de migración exitosa
    localStorage.removeItem('financeData');
    localStorage.removeItem('financeAccounts');
    localStorage.removeItem('categories');
    
    console.log('🎉 Migración completada exitosamente');
  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    throw error;
  }
};