import { useCallback, useMemo } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { useLocalStorage } from './useLocalStorage';
import { useFirestoreData } from '../contexts/FirestoreContext';
import { db } from '../lib/firebaseDb';
import { DEFAULT_TRANSACTION_BENEFICIARIES } from '../config/constants';
import type { Transaction } from '../types/finance';

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  names.forEach((name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const normalized = normalizeName(trimmed);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    result.push(trimmed);
  });

  return result;
}

export function useBeneficiaries(transactions: Transaction[], userId?: string | null) {
  const { transactionBeneficiaries } = useFirestoreData();
  const [localBeneficiaries, setLocalBeneficiaries] = useLocalStorage<string[]>(
    'transactionBeneficiaries',
    [...DEFAULT_TRANSACTION_BENEFICIARIES]
  );

  const beneficiaries = useMemo(() => {
    const transactionNames = transactions
      .map((transaction) => transaction.beneficiary)
      .filter((name): name is string => !!name?.trim());

    return uniqueNames([
      ...DEFAULT_TRANSACTION_BENEFICIARIES,
      ...(userId ? transactionBeneficiaries : localBeneficiaries),
      ...transactionNames,
    ]);
  }, [localBeneficiaries, transactionBeneficiaries, transactions, userId]);

  const persist = useCallback(async (items: string[]) => {
    const cleanItems = uniqueNames(items);
    if (userId) {
      await setDoc(doc(db, `users/${userId}/settings/beneficiaries`), { items: cleanItems }, { merge: true });
    } else {
      setLocalBeneficiaries(cleanItems);
    }
  }, [setLocalBeneficiaries, userId]);

  const addBeneficiary = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('El nombre de la persona no puede estar vacío');
    }

    const normalizedNew = normalizeName(trimmed);
    if (beneficiaries.some((beneficiary) => normalizeName(beneficiary) === normalizedNew)) {
      throw new Error('Esta persona ya existe');
    }

    const currentCustom = userId ? transactionBeneficiaries : localBeneficiaries;
    await persist([...currentCustom, trimmed]);
  }, [beneficiaries, localBeneficiaries, persist, transactionBeneficiaries, userId]);

  const deleteBeneficiary = useCallback(async (name: string) => {
    if ((DEFAULT_TRANSACTION_BENEFICIARIES as readonly string[]).includes(name)) {
      throw new Error('Esta persona es predeterminada y no se puede eliminar');
    }

    if (transactions.some((transaction) => transaction.beneficiary === name)) {
      throw new Error('No puedes eliminar una persona usada en transacciones');
    }

    const currentCustom = userId ? transactionBeneficiaries : localBeneficiaries;
    await persist(currentCustom.filter((beneficiary) => beneficiary !== name));
  }, [localBeneficiaries, persist, transactionBeneficiaries, transactions, userId]);

  return {
    beneficiaries,
    addBeneficiary,
    deleteBeneficiary,
  };
}
