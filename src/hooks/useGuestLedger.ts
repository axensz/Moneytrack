import { useCallback, useEffect, useState } from 'react';
import { logger } from '../utils/logger';
import {
  GUEST_LEDGER_STORAGE_KEY,
  createGuestLedgerEnvelope,
  ensureGuestLedgerEnvelope,
  mutateGuestLedger,
  parseGuestLedgerEnvelope,
  readPersistedGuestLedgerEnvelope,
  subscribeGuestLedger,
  type GuestLedgerEnvelope,
  type GuestLedgerMutationOptions,
  type GuestLedgerMutator,
} from '../utils/guestLedger';

export interface GuestLedgerCommitOptions {
  operationId?: string;
  maxRetries?: number;
}

const emptyEnvelope = (): GuestLedgerEnvelope => createGuestLedgerEnvelope({
  accounts: [],
  transactions: [],
  debts: [],
  recurringPayments: [],
});

const initialEnvelope = (): GuestLedgerEnvelope => {
  try {
    return readPersistedGuestLedgerEnvelope() ?? emptyEnvelope();
  } catch (error) {
    logger.error('No se pudo leer el guest ledger', error);
    return emptyEnvelope();
  }
};

export function useGuestLedger() {
  const [envelope, setEnvelope] = useState<GuestLedgerEnvelope>(initialEnvelope);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const adopt = (next: GuestLedgerEnvelope) => {
      if (!mounted) return;
      setEnvelope(current => next.revision >= current.revision ? next : current);
    };
    const unsubscribe = subscribeGuestLedger(adopt);
    try {
      const persisted = readPersistedGuestLedgerEnvelope();
      if (persisted) adopt(persisted);
    } catch (error) {
      logger.error('No se pudo adoptar el guest ledger verificado', error);
    }
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key !== GUEST_LEDGER_STORAGE_KEY
        || event.newValue === null
        || (typeof localStorage !== 'undefined' && event.storageArea !== localStorage)
      ) return;
      try {
        adopt(parseGuestLedgerEnvelope(event.newValue));
      } catch (error) {
        logger.error('Se ignoró un guest ledger remoto inválido', error);
      }
    };
    window.addEventListener('storage', handleStorage);

    ensureGuestLedgerEnvelope()
      .then(adopt)
      .catch(error => logger.error('No se pudo inicializar el guest ledger', error))
      .finally(() => {
        if (mounted) setReady(true);
      });

    return () => {
      mounted = false;
      unsubscribe();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const mutate = useCallback((
    mutator: GuestLedgerMutator,
    options: GuestLedgerCommitOptions = {},
  ) => mutateGuestLedger(mutator, options as GuestLedgerMutationOptions), []);

  return {
    ready,
    revision: envelope.revision,
    envelope,
    accounts: envelope.data.accounts,
    transactions: envelope.data.transactions,
    debts: envelope.data.debts,
    recurringPayments: envelope.data.recurringPayments,
    mutate,
  };
}
