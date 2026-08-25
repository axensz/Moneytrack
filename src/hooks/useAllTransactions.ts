/**
 * Carga el historial COMPLETO de transacciones (todas las cuentas) para vistas
 * que agregan sobre todo el histórico —los gráficos de Estadísticas (tendencia
 * anual, distribución por categoría) y el resumen por periodo personalizado— que
 * de otro modo solo verían las 500 transacciones recientes del listener paginado.
 *
 * Es una suscripción PEREZOSA: solo se activa cuando el consumidor necesita el
 * historial completo. El primer snapshot carga todo; después Firestore entrega
 * deltas, incluidos cambios hechos desde otra pestaña o dispositivo.
 *
 * Escala: para un uso personal (miles de transacciones) traer todo una vez al
 * abrir Stats es aceptable. Para escala extrema (decenas de miles), el siguiente
 * paso serían agregados precomputados (rollups mensuales) en Firestore en lugar
 * de traer el histórico completo al cliente.
 */

import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebaseDb';
import { logger } from '../utils/logger';
import type { Transaction } from '../types/finance';
import {
  collectDecodedTransactions,
  type TransactionDecodeIssue,
} from '../utils/transactionDecoder';
import { mergeTransactionsById } from './useCreditCardTransactions';
import { publishTransactionCacheMutation } from './firestore/transactionPaginationCache';

interface FullHistoryState {
  userId: string;
  transactions: Transaction[];
  issues: TransactionDecodeIssue[];
  settled: boolean;
}

/**
 * Devuelve TODAS las transacciones del usuario. Hasta confirmar el servidor
 * fusiona el head visible con la caché; después usa el snapshot completo como
 * autoridad. En modo invitado devuelve únicamente el array live.
 */
export function useAllTransactions(
  userId: string | null,
  liveTransactions: Transaction[],
): Transaction[] {
  return useAllTransactionsWithStatus(userId, liveTransactions).transactions;
}

/**
 * Variante con estado de asentamiento: `settled` indica que el PRIMER snapshot
 * completo del servidor para este usuario llegó CON ÉXITO. En error, o mientras
 * solo exista un snapshot parcial de caché, queda false para que el gate de
 * SALDOS no calcule contra la ventana paginada truncada (C1/C2). Mientras
 * settled=false el resultado puede ser solo la ventana live (incompleta): los
 * consumidores que derivan SALDOS deben tratar ese estado como "calculando"
 * (C-FIX paginación + saldos: el flash de saldo incorrecto al recargar).
 * Una vez asentado, el listener mantiene el historial sincronizado mediante
 * deltas remotos, sin reconsultar la colección por cambios del array live.
 */
export function useAllTransactionsWithStatus(
  userId: string | null,
  liveTransactions: Transaction[],
): {
  transactions: Transaction[];
  issues: TransactionDecodeIssue[];
  settled: boolean;
} {
  const [fullHistory, setFullHistory] = useState<FullHistoryState | null>(null);

  useEffect(() => {
    if (!userId) {
      setFullHistory(null);
      return;
    }

    let active = true;
    let initialized = false;
    setFullHistory(null);

    const fullHistoryQuery = query(
      collection(db, `users/${userId}/transactions`),
      orderBy('date', 'desc'),
    );

    const unsubscribe = onSnapshot(
      fullHistoryQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!active) return;

        const settledFromServer = !snapshot.metadata.fromCache;
        const decodedSnapshot = collectDecodedTransactions(snapshot.docs);

        if (!initialized) {
          initialized = true;
          setFullHistory({
            userId,
            ...decodedSnapshot,
            settled: settledFromServer,
          });
          return;
        }

        const changes = snapshot.docChanges();

        // El listener completo también es la fuente remota de verdad para las
        // páginas antiguas ya cargadas. Solo propagamos cambios confirmados:
        // las escrituras locales pendientes ya se publican tras su commit y una
        // mutación optimista rechazada no debe borrar una fila de la caché.
        if (!snapshot.metadata.hasPendingWrites && changes.length > 0) {
          const decodedChanges = collectDecodedTransactions(
            changes
              .filter((change) => change.type !== 'removed')
              .map((change) => change.doc),
          );
          const deletedIds = [
            ...changes
            .filter((change) => change.type === 'removed')
            .map((change) => change.doc.id),
            ...decodedChanges.issues.map((issue) => issue.transactionId),
          ];

          if (deletedIds.length > 0) {
            publishTransactionCacheMutation({
              userId,
              type: 'delete',
              transactionIds: deletedIds,
            });
          }
          if (decodedChanges.transactions.length > 0) {
            publishTransactionCacheMutation({
              userId,
              type: 'update',
              transactions: decodedChanges.transactions,
            });
          }
        }

        setFullHistory((current) => {
          if (!current || current.userId !== userId) {
            return {
              userId,
              ...decodedSnapshot,
              settled: settledFromServer,
            };
          }

          const settled = current.settled || settledFromServer;
          if (changes.length === 0) {
            return settled === current.settled ? current : { ...current, settled };
          }

          return { userId, ...decodedSnapshot, settled };
        });
      },
      (err) => {
        if (!active) return;
        logger.error('Error cargando el historial completo de transacciones', err);
        // Sin primer snapshot de servidor no se asienta: el gate de saldos sigue
        // en "Calculando…" en vez de usar una ventana potencialmente incompleta.
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  // La clave de usuario en el estado impide exponer el historial de la sesión
  // anterior durante el render previo al cleanup/primer snapshot del nuevo user.
  const transactions = useMemo(() => {
    const currentFullHistory = fullHistory?.userId === userId ? fullHistory : null;

    // Una vez confirmado el snapshot completo del servidor, esa colección es
    // exhaustiva y autoritativa. No anexamos filas ausentes del array paginado:
    // podrían ser versiones obsoletas o documentos ya eliminados remotamente.
    if (currentFullHistory?.settled) return currentFullHistory.transactions;

    // Antes del primer snapshot de servidor, conservar el head visible y sumar
    // cualquier cola que haya llegado desde la caché local.
    return mergeTransactionsById(
      liveTransactions,
      currentFullHistory?.transactions ?? [],
    );
  }, [liveTransactions, fullHistory, userId]);

  return {
    transactions,
    issues: fullHistory?.userId === userId ? fullHistory.issues : [],
    // Invitado (sin userId): no hay nada que fetchear → siempre asentado.
    settled: !userId || (
      fullHistory?.userId === userId
      && fullHistory.settled
    ),
  };
}
