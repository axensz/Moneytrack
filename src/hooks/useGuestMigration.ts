/**
 * useGuestMigration (S1) — Detecta datos del modo invitado al iniciar sesión y
 * ofrece importarlos a la cuenta del usuario.
 *
 * Se ejecuta una sola vez por login. Si el usuario elige "Ahora no", los datos
 * locales se conservan y se vuelve a preguntar en el siguiente login (nunca se
 * borran en silencio aquí; el borrado en logout lo cubre S2).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { logger } from '../utils/logger';
import {
  readGuestData,
  countGuestData,
  hasGuestData,
  migrateGuestData,
  type GuestDataCounts,
} from '../utils/guestMigration';

type MigrationStatus = 'idle' | 'prompt' | 'migrating' | 'error';

export interface UseGuestMigrationResult {
  showPrompt: boolean;
  isMigrating: boolean;
  hasError: boolean;
  counts: GuestDataCounts | null;
  runMigration: () => Promise<void>;
  dismiss: () => void;
}

export function useGuestMigration(userId: string | null): UseGuestMigrationResult {
  const [status, setStatus] = useState<MigrationStatus>('idle');
  const [counts, setCounts] = useState<GuestDataCounts | null>(null);
  // Garantiza que la detección corra una sola vez por usuario.
  const checkedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      checkedForRef.current = null;
      return;
    }
    if (checkedForRef.current === userId) return;
    checkedForRef.current = userId;

    const data = readGuestData();
    if (hasGuestData(data)) {
      setCounts(countGuestData(data));
      setStatus('prompt');
    }
  }, [userId]);

  const runMigration = useCallback(async () => {
    if (!userId) return;
    setStatus('migrating');
    try {
      const result = await migrateGuestData(userId);
      toast.success(`Datos importados a tu cuenta (${result.counts.total} elementos)`);
      setStatus('idle');
    } catch (err) {
      logger.error('Error migrando datos de invitado', err);
      toast.error('No se pudieron importar los datos. Puedes reintentar.');
      setStatus('error');
    }
  }, [userId]);

  const dismiss = useCallback(() => {
    // "Ahora no": conservar datos locales y re-preguntar en el próximo login.
    setStatus('idle');
  }, []);

  return {
    showPrompt: status === 'prompt' || status === 'error',
    isMigrating: status === 'migrating',
    hasError: status === 'error',
    counts,
    runMigration,
    dismiss,
  };
}
