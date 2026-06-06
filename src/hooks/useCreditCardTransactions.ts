/**
 * S-FIX (paginación + TC): historial COMPLETO de transacciones de tarjetas de crédito.
 *
 * PROBLEMA:
 * El listener principal (useFirestoreSubscriptions) limita las transacciones en
 * memoria a las 500 más recientes (PAGE_SIZE). Los cálculos de tarjeta de crédito
 * que recorren ese array —estado de cuenta (useCreditCardStatement) e intereses
 * (useCreditCardInterests)— pierden las compras a CUOTAS de ciclos antiguos cuando
 * la compra original quedó fuera de esas 500. Resultado: cargos, cuotas e intereses
 * subreportados para usuarios con muchas transacciones.
 *
 * SOLUCIÓN (escalable):
 * Cargar SOLO el subconjunto de transacciones que tocan una tarjeta de crédito
 * (un conjunto pequeño comparado con el total) mediante un query completo a
 * Firestore, y fusionarlo con el array live paginado. Así:
 *  - Las compras a cuotas antiguas reaparecen en estado de cuenta e intereses.
 *  - Los cambios recientes siguen llegando en tiempo real vía el array live.
 *
 * No carga TODAS las transacciones (eso no escalaría); solo las de las TC.
 */

import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ensureDate } from '../utils/dateUtils';
import { logger } from '../utils/logger';
import type { Account, Transaction } from '../types/finance';

// Firestore limita los operadores 'in' a 30 valores por query.
const IN_CHUNK = 30;

/**
 * Fusiona las transacciones live (paginadas, recientes) con el historial completo
 * de TC, deduplicando por id. La versión LIVE gana ante coincidencias (refleja
 * ediciones recientes); el historial completo aporta la cola antigua que la
 * paginación dejó fuera.
 */
export function mergeCreditTransactions(
  live: Transaction[],
  fullCredit: Transaction[],
): Transaction[] {
  if (fullCredit.length === 0) return live;
  const byId = new Map<string, Transaction>();
  for (const t of live) {
    if (t.id) byId.set(t.id, t);
  }
  for (const t of fullCredit) {
    if (t.id && !byId.has(t.id)) byId.set(t.id, t);
  }
  return Array.from(byId.values());
}

/**
 * Devuelve el conjunto de transacciones a usar en cálculos de tarjeta de crédito:
 * el array live fusionado con el historial completo de las TC.
 *
 * @param userId         usuario autenticado (null en modo invitado → devuelve live)
 * @param accounts       cuentas (para identificar las TC y sus mergedAccountIds)
 * @param liveTransactions array paginado del listener principal
 */
export function useCreditCardTransactions(
  userId: string | null,
  accounts: Account[],
  liveTransactions: Transaction[],
): Transaction[] {
  const creditIds = useMemo(
    () =>
      accounts
        .filter((a) => a.type === 'credit' && a.id)
        .flatMap((a) => [a.id!, ...(a.mergedAccountIds ?? [])]),
    [accounts],
  );
  // Clave estable para deps del efecto (evita refetch por nueva referencia de array).
  const creditIdsKey = creditIds.join(',');

  const [fullCreditTxs, setFullCreditTxs] = useState<Transaction[]>([]);

  useEffect(() => {
    let cancelled = false;

    // Modo invitado o sin TC: no hay nada que cargar aparte del array live.
    if (!userId || creditIdsKey === '') {
      setFullCreditTxs([]);
      return;
    }

    const fetchAll = async () => {
      try {
        const base = `users/${userId}`;
        const ids = creditIdsKey.split(',');
        const byId = new Map<string, Transaction>();

        for (let i = 0; i < ids.length; i += IN_CHUNK) {
          const chunk = ids.slice(i, i + IN_CHUNK);
          // Gastos/ingresos en la TC (accountId) + transferencias hacia la TC (toAccountId).
          const [accountSnap, transferSnap] = await Promise.all([
            getDocs(query(collection(db, `${base}/transactions`), where('accountId', 'in', chunk))),
            getDocs(query(collection(db, `${base}/transactions`), where('toAccountId', 'in', chunk))),
          ]);
          [...accountSnap.docs, ...transferSnap.docs].forEach((d) => {
            byId.set(d.id, {
              id: d.id,
              ...d.data(),
              date: ensureDate(d.data().date),
            } as Transaction);
          });
        }

        if (!cancelled) setFullCreditTxs(Array.from(byId.values()));
      } catch (err) {
        logger.error('Error cargando historial de tarjetas de crédito', err);
        // En error, dejamos el set vacío → el merge cae al array live (degradación suave).
      }
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
    // liveTransactions.length: refetch cuando se agrega/elimina una transacción.
    // creditIdsKey: refetch cuando cambian las TC (nueva tarjeta / unificación).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, creditIdsKey, liveTransactions.length]);

  return useMemo(
    () => mergeCreditTransactions(liveTransactions, fullCreditTxs),
    [liveTransactions, fullCreditTxs],
  );
}
