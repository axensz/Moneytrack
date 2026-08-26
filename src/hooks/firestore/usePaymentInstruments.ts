import { useCallback, useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../lib/firebaseDb';
import type {
  PaymentInstrument,
  PaymentInstrumentKind,
  PaymentInstrumentNetwork,
} from '../../types/transactionImport';
import { decodePaymentInstrument } from '../../utils/transactionImportDecoder';

export interface NewPaymentInstrument {
  label: string;
  accountId: string;
  kind: PaymentInstrumentKind;
  last4: string;
  network: PaymentInstrumentNetwork;
}

export type PaymentInstrumentUpdate = Partial<Pick<
  PaymentInstrument,
  'label' | 'accountId' | 'kind' | 'last4' | 'network'
>>;

export interface UsePaymentInstrumentsReturn {
  instruments: PaymentInstrument[];
  loading: boolean;
  error: Error | null;
  createInstrument: (instrument: NewPaymentInstrument) => Promise<void>;
  updateInstrument: (
    instrumentId: string,
    updates: PaymentInstrumentUpdate,
  ) => Promise<void>;
  setInstrumentActive: (
    instrumentId: string,
    active: boolean,
  ) => Promise<void>;
  deleteInstrument: (instrumentId: string) => Promise<void>;
}

export function usePaymentInstruments(
  userId: string | null,
): UsePaymentInstrumentsReturn {
  const [instruments, setInstruments] = useState<PaymentInstrument[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    setInstruments([]);
    setError(null);

    if (!userId) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, 'users', userId, 'paymentInstruments'),
      snapshot => {
        if (!active) return;

        const decoded = snapshot.docs.map(document => (
          decodePaymentInstrument(document)
        ));
        const issue = decoded.find(result => !result.ok);
        setInstruments(decoded.flatMap(result => (
          result.ok ? [result.instrument] : []
        )));
        setError(issue && !issue.ok ? new Error(issue.issue.message) : null);
        setLoading(false);
      },
      subscriptionError => {
        if (!active) return;
        setInstruments([]);
        setError(
          subscriptionError instanceof Error
            ? subscriptionError
            : new Error('No se pudieron cargar los medios de pago.'),
        );
        setLoading(false);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  const createInstrument = useCallback(
    async (instrument: NewPaymentInstrument) => {
      if (!userId) return;
      await addDoc(collection(db, 'users', userId, 'paymentInstruments'), {
        schemaVersion: 1,
        label: instrument.label,
        accountId: instrument.accountId,
        kind: instrument.kind,
        last4: instrument.last4,
        network: instrument.network,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    },
    [userId],
  );

  const updateInstrument = useCallback(
    async (
      instrumentId: string,
      updates: PaymentInstrumentUpdate,
    ) => {
      if (!userId) return;
      await updateDoc(
        doc(db, 'users', userId, 'paymentInstruments', instrumentId),
        {
          ...(updates.label === undefined ? {} : { label: updates.label }),
          ...(updates.accountId === undefined
            ? {}
            : { accountId: updates.accountId }),
          ...(updates.kind === undefined ? {} : { kind: updates.kind }),
          ...(updates.last4 === undefined ? {} : { last4: updates.last4 }),
          ...(updates.network === undefined
            ? {}
            : { network: updates.network }),
          updatedAt: serverTimestamp(),
        },
      );
    },
    [userId],
  );

  const setInstrumentActive = useCallback(
    async (instrumentId: string, active: boolean) => {
      if (!userId) return;
      await updateDoc(
        doc(db, 'users', userId, 'paymentInstruments', instrumentId),
        {
          active,
          updatedAt: serverTimestamp(),
        },
      );
    },
    [userId],
  );

  const deleteInstrument = useCallback(
    async (instrumentId: string) => {
      if (!userId) return;
      await deleteDoc(
        doc(db, 'users', userId, 'paymentInstruments', instrumentId),
      );
    },
    [userId],
  );

  return {
    instruments,
    loading,
    error,
    createInstrument,
    updateInstrument,
    setInstrumentActive,
    deleteInstrument,
  };
}
