import { useCallback, useEffect, useMemo, useState } from 'react';
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

export type RequestedTransactionImportCandidateStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'missing'
  | 'terminal'
  | 'error';

export interface ResolvedTransactionImportCandidateRequest {
  userId: string;
  candidateId: string;
}

export interface UseTransactionImportCandidatesReturn {
  candidates: PendingTransactionImportCandidate[];
  requestedCandidate: PendingTransactionImportCandidate | null;
  requestedStatus: RequestedTransactionImportCandidateStatus;
  requestedRequest: ResolvedTransactionImportCandidateRequest | null;
  loading: boolean;
  error: Error | null;
  reachedLimit: boolean;
  dismissCandidate: (candidateId: string) => Promise<void>;
}

export function useTransactionImportCandidates(
  userId: string | null,
  requestedCandidateId: string | null = null,
): UseTransactionImportCandidatesReturn {
  const [listedCandidates, setListedCandidates] = useState<
    PendingTransactionImportCandidate[]
  >([]);
  const [listedOwnerUserId, setListedOwnerUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [listError, setListError] = useState<Error | null>(null);
  const [reachedLimit, setReachedLimit] = useState(false);
  const [requestedCandidate, setRequestedCandidate] = useState<
    PendingTransactionImportCandidate | null
  >(null);
  const [requestedStatus, setRequestedStatus] = useState<
    RequestedTransactionImportCandidateStatus
  >('idle');
  const [requestedRequest, setRequestedRequest] = useState<
    ResolvedTransactionImportCandidateRequest | null
  >(null);
  const [requestedError, setRequestedError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    setListedCandidates([]);
    setListedOwnerUserId(null);
    setListError(null);
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
      limit(CANDIDATE_PAGE_SIZE + 1),
    );
    const unsubscribe = onSnapshot(
      candidateQuery,
      snapshot => {
        if (!active) return;

        const decoded = snapshot.docs.slice(0, CANDIDATE_PAGE_SIZE).map(document => (
          decodeTransactionImportCandidate(document)
        ));
        const issue = decoded.find(result => (
          !result.ok || result.candidate.status !== 'pending'
        ));
        setListedCandidates(decoded.flatMap(result => (
          result.ok && result.candidate.status === 'pending'
            ? [result.candidate]
            : []
        )));
        setListedOwnerUserId(userId);
        setListError(
          issue
            ? new Error(
              issue.ok
                ? `El documento ${issue.candidate.id} no está pendiente.`
                : issue.issue.message,
            )
            : null,
        );
        setReachedLimit(snapshot.docs.length > CANDIDATE_PAGE_SIZE);
        setLoading(false);
      },
      subscriptionError => {
        if (!active) return;
        setListedCandidates([]);
        setListedOwnerUserId(userId);
        setListError(
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

  useEffect(() => {
    let active = true;
    setRequestedCandidate(null);
    setRequestedError(null);
    setRequestedRequest(null);

    if (!userId || !requestedCandidateId) {
      setRequestedStatus('idle');
      return () => {
        active = false;
      };
    }

    setRequestedStatus('loading');
    const unsubscribe = onSnapshot(
      doc(
        db,
        'users',
        userId,
        'transactionImportCandidates',
        requestedCandidateId,
      ),
      { includeMetadataChanges: true },
      snapshot => {
        if (!active) return;
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
        setRequestedRequest({ userId, candidateId: requestedCandidateId });
        setRequestedError(null);
        if (!snapshot.exists()) {
          setRequestedCandidate(null);
          setRequestedStatus('missing');
          return;
        }

        const decoded = decodeTransactionImportCandidate(snapshot);
        if (!decoded.ok) {
          setRequestedCandidate(null);
          setRequestedError(new Error(decoded.issue.message));
          setRequestedStatus('error');
          return;
        }
        if (decoded.candidate.status !== 'pending') {
          setRequestedCandidate(null);
          setRequestedStatus('terminal');
          return;
        }
        if (decoded.candidate.source !== 'android-shortcut') {
          setRequestedCandidate(null);
          setRequestedError(new Error(
            'El enlace no corresponde a un borrador de gasto rápido.',
          ));
          setRequestedStatus('error');
          return;
        }

        setRequestedCandidate(decoded.candidate);
        setRequestedStatus('ready');
      },
      subscriptionError => {
        if (!active) return;
        setRequestedRequest({ userId, candidateId: requestedCandidateId });
        setRequestedCandidate(null);
        setRequestedError(
          subscriptionError instanceof Error
            ? subscriptionError
            : new Error('No se pudo abrir el borrador de gasto rápido.'),
        );
        setRequestedStatus('error');
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [requestedCandidateId, userId]);

  const visibleListedCandidates = useMemo(
    () => listedOwnerUserId === userId ? listedCandidates : [],
    [listedCandidates, listedOwnerUserId, userId],
  );
  const requestedRequestMatches = requestedRequest?.userId === userId &&
    requestedRequest.candidateId === requestedCandidateId;
  const visibleRequestedCandidate = requestedRequestMatches
    ? requestedCandidate
    : null;
  const candidates = useMemo(() => {
    if (
      !visibleRequestedCandidate
      || visibleListedCandidates.some(candidate => candidate.id === visibleRequestedCandidate.id)
    ) {
      return visibleListedCandidates;
    }
    return [visibleRequestedCandidate, ...visibleListedCandidates];
  }, [visibleListedCandidates, visibleRequestedCandidate]);

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
    requestedCandidate: visibleRequestedCandidate,
    requestedStatus: !userId || !requestedCandidateId
      ? 'idle'
      : requestedRequestMatches
        ? requestedStatus
        : 'loading',
    requestedRequest: requestedRequestMatches ? requestedRequest : null,
    loading: Boolean(userId) && (listedOwnerUserId !== userId || loading),
    error: (requestedRequestMatches ? requestedError : null) ??
      (listedOwnerUserId === userId ? listError : null),
    reachedLimit: listedOwnerUserId === userId && reachedLimit,
    dismissCandidate,
  };
}
