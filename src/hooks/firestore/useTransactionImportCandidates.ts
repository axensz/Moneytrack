import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../lib/firebaseDb';
import type { PendingTransactionImportCandidate } from '../../types/transactionImport';
import { decodeTransactionImportCandidate } from '../../utils/transactionImportDecoder';

const CANDIDATE_PAGE_SIZE = 100;

export interface UseTransactionImportCandidatesReturn {
  candidates: PendingTransactionImportCandidate[];
  loading: boolean;
  error: Error | null;
  reachedLimit: boolean;
  dismissCandidate: (candidateId: string) => Promise<void>;
}

export function useTransactionImportCandidates(
  userId: string | null,
): UseTransactionImportCandidatesReturn {
  const [candidates, setCandidates] = useState<PendingTransactionImportCandidate[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<Error | null>(null);
  const [reachedLimit, setReachedLimit] = useState(false);

  useEffect(() => {
    let active = true;
    setCandidates([]);
    setError(null);
    setReachedLimit(false);

    if (!userId) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    const candidateQuery = query(
      collection(db, 'users', userId, 'transactionImportCandidates'),
      where('status', '==', 'pending'),
      orderBy('occurredAt', 'desc'),
      limit(CANDIDATE_PAGE_SIZE),
    );
    const unsubscribe = onSnapshot(
      candidateQuery,
      snapshot => {
        if (!active) return;

        const decoded = snapshot.docs.map(document => (
          decodeTransactionImportCandidate(document)
        ));
        const issue = decoded.find(result => (
          !result.ok || result.candidate.status !== 'pending'
        ));
        setCandidates(decoded.flatMap(result => (
          result.ok && result.candidate.status === 'pending'
            ? [result.candidate]
            : []
        )));
        setError(
          issue
            ? new Error(
              issue.ok
                ? `El documento ${issue.candidate.id} no está pendiente.`
                : issue.issue.message,
            )
            : null,
        );
        setReachedLimit(snapshot.docs.length === CANDIDATE_PAGE_SIZE);
        setLoading(false);
      },
      subscriptionError => {
        if (!active) return;
        setCandidates([]);
        setError(
          subscriptionError instanceof Error
            ? subscriptionError
            : new Error('No se pudieron cargar las transacciones por revisar.'),
        );
        setReachedLimit(false);
        setLoading(false);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  const dismissCandidate = useCallback(
    async (candidateId: string) => {
      if (!userId) return;
      await updateDoc(
        doc(db, 'users', userId, 'transactionImportCandidates', candidateId),
        {
          status: 'dismissed',
          dismissedAt: serverTimestamp(),
        },
      );
    },
    [userId],
  );

  return {
    candidates,
    loading,
    error,
    reachedLimit,
    dismissCandidate,
  };
}
