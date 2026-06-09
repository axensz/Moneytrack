import { useCallback, useState } from 'react';
import { collection, writeBatch, doc, getDocs, type DocumentReference } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { showToast } from '../utils/toastHelpers';
import { logger } from '../utils/logger';
import type { Transaction, Account, Categories, BackupData } from '../types/finance';
import { TRANSFER_CATEGORY } from '../config/constants';

interface UseBackupProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: Categories;
  userId: string | null;
  refreshData?: () => Promise<void>; // Callback para recargar datos después de importar
}

type ImportStrategy = 'merge' | 'replace';

/**
 * 🟢 Hook para exportar e importar datos de la aplicación
 * 
 * CARACTERÍSTICAS:
 * ✅ Exportación completa a JSON
 * ✅ Importación con batch writes a Firestore
 * ✅ Estrategias: merge (combinar) o replace (reemplazar)
 * ✅ Validación de integridad referencial
 * ✅ Manejo de errores robusto
 * ✅ Progress feedback
 */
export const useBackup = ({ transactions, accounts, categories, userId, refreshData }: UseBackupProps) => {
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  /**
   * Exporta todos los datos a un archivo JSON
   */
  const exportData = useCallback((): void => {
    try {
      const data: BackupData = {
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

      showToast.success('Datos exportados correctamente');
      logger.info('Backup exported successfully', { 
        transactionsCount: transactions.length, 
        accountsCount: accounts.length 
      });
    } catch (error) {
      logger.error('Error exporting backup', error);
      showToast.error('Error al exportar datos');
    }
  }, [transactions, accounts, categories]);

  /**
   * Valida la estructura del archivo de respaldo
   */
  const validateBackupData = (data: unknown): data is BackupData => {
    if (!data || typeof data !== 'object') {
      throw new Error('Archivo de respaldo inválido');
    }

    const record = data as Record<string, unknown>;

    if (!record.version || record.version !== '1.0') {
      throw new Error('Versión de respaldo no compatible');
    }

    if (!Array.isArray(record.transactions) || !Array.isArray(record.accounts)) {
      throw new Error('Estructura de datos inválida');
    }

    // Validar que las categorías existen
    const cats = record.categories as Record<string, unknown> | undefined;
    if (!cats || !Array.isArray(cats.expense) || !Array.isArray(cats.income)) {
      throw new Error('Categorías inválidas');
    }

    return true;
  };

  /**
   * Valida la integridad referencial de los datos
   */
  const validateReferentialIntegrity = (backupData: BackupData): void => {
    const accountIds = new Set(backupData.accounts.map(a => a.id).filter(Boolean));
    const allCategories = [
      ...backupData.categories.expense,
      ...backupData.categories.income,
      TRANSFER_CATEGORY
    ];

    // Validar que cada transacción referencia una cuenta válida
    for (const transaction of backupData.transactions) {
      if (!accountIds.has(transaction.accountId)) {
        throw new Error(
          `Transacción "${transaction.description}" referencia una cuenta inexistente (${transaction.accountId})`
        );
      }

      if (transaction.toAccountId && !accountIds.has(transaction.toAccountId)) {
        throw new Error(
          `Transferencia "${transaction.description}" referencia una cuenta destino inexistente`
        );
      }

      if (!allCategories.includes(transaction.category)) {
        logger.warn('Transaction with unknown category', { 
          category: transaction.category,
          transaction: transaction.description 
        });
      }
    }

    logger.info('Referential integrity validated successfully');
  };

  /**
   * Captura (SOLO LECTURA) las referencias de todos los documentos existentes del
   * usuario, sin borrar nada. Se usa en la estrategia "replace" para borrarlos
   * DESPUÉS de escribir los nuevos (write-then-delete), evitando pérdida de datos
   * si la escritura falla a mitad. Audit C1.
   */
  const snapshotExistingRefs = async (uid: string): Promise<DocumentReference[]> => {
    const [transactionsSnapshot, accountsSnapshot, categoriesSnapshot] = await Promise.all([
      getDocs(collection(db, `users/${uid}/transactions`)),
      getDocs(collection(db, `users/${uid}/accounts`)),
      getDocs(collection(db, `users/${uid}/categories`)),
    ]);

    return [
      ...transactionsSnapshot.docs.map(d => doc(db, `users/${uid}/transactions`, d.id)),
      ...accountsSnapshot.docs.map(d => doc(db, `users/${uid}/accounts`, d.id)),
      ...categoriesSnapshot.docs.map(d => doc(db, `users/${uid}/categories`, d.id)),
    ];
  };

  /**
   * Borra en batches (límite 500 de Firestore) un conjunto de referencias ya
   * capturadas previamente con snapshotExistingRefs.
   */
  const deleteRefsInBatches = async (refs: DocumentReference[]): Promise<void> => {
    for (let i = 0; i < refs.length; i += 499) {
      const batch = writeBatch(db);
      refs.slice(i, i + 499).forEach(ref => batch.delete(ref));
      await batch.commit();
    }
  };

  /**
   * Importa datos usando Batch Writes de Firestore
   */
  const importDataToFirestore = async (
    uid: string,
    backupData: BackupData,
    strategy: ImportStrategy
  ): Promise<void> => {
    logger.info('Starting data import', { strategy, itemsCount: backupData.transactions.length });

    // REPLACE SEGURO (write-then-delete): para NO perder datos si la escritura falla o
    // se cierra la pestaña a mitad, no borramos antes de importar. Capturamos las
    // referencias viejas, escribimos TODO lo nuevo con IDs nuevos (sin colisión) y SOLO
    // al terminar borramos lo viejo. Si algo falla antes del borrado, los datos
    // originales quedan intactos (a lo sumo coexisten duplicados, recuperable — nunca
    // pérdida total como antes). La atomicidad estricta (swap transaccional) requiere
    // el harness de tests de Firestore pendiente. Audit C1.
    let oldRefs: DocumentReference[] = [];
    if (strategy === 'replace') {
      logger.info('Replace: snapshotting existing data before import (no deletion yet)');
      oldRefs = await snapshotExistingRefs(uid);
    }

    setImportProgress(40);

    // Firestore soporta máximo 500 operaciones por batch
    const BATCH_SIZE = 500;
    let batch = writeBatch(db);
    let operationCount = 0;

    // Función auxiliar para ejecutar batch cuando alcanza el límite
    const commitIfNeeded = async () => {
      if (operationCount >= BATCH_SIZE) {
        await batch.commit();
        batch = writeBatch(db);
        operationCount = 0;
        logger.debug('Batch committed', { operations: BATCH_SIZE });
      }
    };

    // Forzar commit del batch actual y reiniciar (para separar grupos lógicos)
    const flushBatch = async () => {
      if (operationCount > 0) {
        await batch.commit();
        batch = writeBatch(db);
        operationCount = 0;
      }
    };

    // 1. Importar cuentas — mapear IDs viejos → nuevos para mantener referencias
    const accountIdMap = new Map<string, string>();
    for (const account of backupData.accounts) {
      const accountRef = doc(collection(db, `users/${uid}/accounts`));
      const { id: oldId, ...accountData } = account;
      if (oldId) {
        accountIdMap.set(oldId, accountRef.id);
      }
      batch.set(accountRef, {
        ...accountData,
        createdAt: accountData.createdAt ? new Date(accountData.createdAt) : new Date()
      });
      operationCount++;
      await commitIfNeeded();
    }

    // Commit cuentas antes de procesar categorías (garantiza separación atómica)
    await flushBatch();
    setImportProgress(60);

    // 2. Importar categorías personalizadas
    //    - replace: importar TODAS las del backup (las viejas se borran al final, así
    //      que filtrar contra ellas las perdería).
    //    - merge: importar solo las que aún no existan.
    const existingCategories = new Set([
      ...categories.expense,
      ...categories.income
    ]);
    const shouldImportCategory = (cat: string): boolean =>
      strategy === 'replace' || !existingCategories.has(cat);

    const newExpenseCategories = backupData.categories.expense.filter(shouldImportCategory);
    const newIncomeCategories = backupData.categories.income.filter(shouldImportCategory);

    for (const category of newExpenseCategories) {
      const categoryRef = doc(collection(db, `users/${uid}/categories`));
      batch.set(categoryRef, {
        type: 'expense',
        name: category
      });
      operationCount++;
      await commitIfNeeded();
    }

    for (const category of newIncomeCategories) {
      const categoryRef = doc(collection(db, `users/${uid}/categories`));
      batch.set(categoryRef, {
        type: 'income',
        name: category
      });
      operationCount++;
      await commitIfNeeded();
    }

    // Commit categorías antes de procesar transacciones
    await flushBatch();
    setImportProgress(80);

    // 3. Importar transacciones — remap accountId/toAccountId con el mapa de IDs
    for (const transaction of backupData.transactions) {
      const transactionRef = doc(collection(db, `users/${uid}/transactions`));
      const { id, ...transactionData } = transaction;
      const mappedAccountId = accountIdMap.get(transactionData.accountId) || transactionData.accountId;
      const mappedToAccountId = transactionData.toAccountId
        ? (accountIdMap.get(transactionData.toAccountId) || transactionData.toAccountId)
        : undefined;
      batch.set(transactionRef, {
        ...transactionData,
        accountId: mappedAccountId,
        ...(mappedToAccountId !== undefined && { toAccountId: mappedToAccountId }),
        date: transactionData.date ? new Date(transactionData.date) : new Date(),
        createdAt: transactionData.createdAt ? new Date(transactionData.createdAt) : new Date()
      });
      operationCount++;
      await commitIfNeeded();
    }

    // Commit final
    if (operationCount > 0) {
      await batch.commit();
    }

    // 4. REPLACE: ahora que TODO lo nuevo está escrito con éxito, borrar lo viejo.
    // Si la ejecución falló en cualquier punto anterior, este borrado NUNCA corre y
    // los datos originales quedan intactos. Audit C1.
    if (strategy === 'replace' && oldRefs.length > 0) {
      logger.info('Replace: deleting previous data after successful import', { count: oldRefs.length });
      setImportProgress(90);
      await deleteRefsInBatches(oldRefs);
    }

    setImportProgress(100);
    logger.info('Data import completed successfully');
  };

  /**
   * Importa datos desde un archivo JSON
   */
  const importData = useCallback(
    async (file: File, strategy: ImportStrategy = 'merge'): Promise<void> => {
      if (!userId) {
        showToast.error('Debes iniciar sesión para importar datos');
        return;
      }

      setIsImporting(true);
      setImportProgress(0);

      try {
        // Leer archivo
        const fileContent = await file.text();
        const backupData = JSON.parse(fileContent);

        // Validar estructura
        validateBackupData(backupData);
        setImportProgress(20);

        // Validar integridad referencial
        validateReferentialIntegrity(backupData);

        // Importar a Firestore
        await importDataToFirestore(userId, backupData, strategy);

        // Recargar datos
        if (refreshData) {
          await refreshData();
        }

        showToast.success(
          `Datos importados correctamente (${backupData.transactions.length} transacciones, ${backupData.accounts.length} cuentas)`
        );
        logger.info('Import completed successfully', {
          transactions: backupData.transactions.length,
          accounts: backupData.accounts.length,
          strategy
        });
      } catch (error) {
        logger.error('Error importing data', error);
        showToast.error(
          error instanceof Error ? error.message : 'Error al importar datos'
        );
      } finally {
        setIsImporting(false);
        setImportProgress(0);
      }
    },
    [userId, categories, refreshData]
  );

  return { 
    exportData, 
    importData, 
    isImporting, 
    importProgress 
  };
};