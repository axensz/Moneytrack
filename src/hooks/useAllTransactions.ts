/**
 * Carga el historial COMPLETO de transacciones (todas las cuentas) para vistas
 * que agregan sobre todo el histórico —los gráficos de Estadísticas (tendencia
 * anual, distribución por categoría) y el resumen por periodo personalizado— que
 * de otro modo solo verían las 500 transacciones recientes del listener paginado.
 *
 * Es un fetch ÚNICO y PEREZOSO: la vista de Estadísticas es lazy, así que esto
 * solo corre cuando el usuario la abre, sin tocar el listener siempre-activo.
 * Se fusiona con el array live para reflejar cambios recientes al instante.
 *
 * Escala: para un uso personal (miles de transacciones) traer todo una vez al
 * abrir Stats es aceptable. Para escala extrema (decenas de miles), el siguiente
 * paso serían agregados precomputados (rollups mensuales) en Firestore en lugar
 * de traer el histórico completo al cliente.
 */

import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebaseDb';
import { ensureDate } from '../utils/dateUtils';
import { logger } from '../utils/logger';
import type { Transaction } from '../types/finance';
import { mergeTransactionsById } from './useCreditCardTransactions';

/**
 * Devuelve TODAS las transacciones del usuario (historial completo) fusionadas
 * con el array live. En modo invitado (sin userId) devuelve solo el array live.
 */
export function useAllTransactions(
  userId: string | null,
  liveTransactions: Transaction[],
): Transaction[] {
  return useAllTransactionsWithStatus(userId, liveTransactions).transactions;
}

/**
 * Variante con estado de asentamiento: `settled` indica que el PRIMER fetch del
 * historial completo para este usuario resolvió CON ÉXITO (tenemos el historial
 * completo). En error NO se asienta: `settled` queda false para que el gate de
 * SALDOS no calcule contra la ventana paginada truncada (C1/C2). Mientras
 * settled=false el resultado puede ser solo la ventana live (incompleta): los
 * consumidores que derivan SALDOS deben tratar ese estado como "calculando"
 * (C-FIX paginación + saldos: el flash de saldo incorrecto al recargar).
 * Los refetches posteriores NO des-asientan: el snapshot stale + el array live
 * mantienen el conjunto completo durante el gap.
 */
export function useAllTransactionsWithStatus(
  userId: string | null,
  liveTransactions: Transaction[],
): { transactions: Transaction[]; settled: boolean } {
  const [fullTxs, setFullTxs] = useState<Transaction[]>([]);
  const [settledForUser, setSettledForUser] = useState<string | null>(null);

  // Firma = SET de IDs del array live (no los campos). El refetch del historial
  // completo solo debe ocurrir cuando cambia la MEMBRESÍA (alta/baja), no al
  // EDITAR campos (R-allTx-refetch): antes la firma incluía monto/fecha/categoría/
  // tipo/pago, así que cada edición re-leía la colección ENTERA (N lecturas de
  // Firestore por cada edit con Stats abierto).
  //
  // Por qué es correcto omitir las ediciones: el retorno fusiona con precedencia
  // del array LIVE (mergeTransactionsById(primary=live, secondary=full) — el live
  // gana por id), y toda transacción editable está en el array live. Así una
  // edición ya se refleja en el merge sin tocar `fullTxs`. La baja sí debe
  // refetchear para purgar la copia stale de `fullTxs` (que de otro modo
  // reaparecería vía el secondary); la baja cambia el set de IDs → dispara refetch.
  const liveIdsSignature = useMemo(() => {
    return liveTransactions
      .map((t) => t.id)
      .filter(Boolean)
      .sort()
      .join('|');
  }, [liveTransactions]);

  useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setFullTxs([]);
      return;
    }

    const fetchAll = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, `users/${userId}/transactions`), orderBy('date', 'desc')),
        );
        if (!cancelled) {
          setFullTxs(
            snap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
              date: ensureDate(d.data().date),
            }) as Transaction),
          );
          // Asentar SOLO con éxito: ya tenemos el historial completo. En error NO
          // se asienta (C1/C2): el único consumidor de `settled` es el gate de
          // SALDOS (useBalanceTransactions); darle luz verde sobre la ventana
          // paginada truncada corrompe el saldo al ajustar. Stats no lee `settled`,
          // así que degrada al array live igual. Recuperación: recarga o el refetch
          // por cambio de membresía (alta/baja) reintenta.
          // ponytail: sin reintento automático; añadir uno si el "Calculando…"
          // tras un blip transitorio resulta molesto.
          setSettledForUser(userId);
        }
      } catch (err) {
        logger.error('Error cargando el historial completo de transacciones', err);
        // NO asentar en error: ver nota arriba. El gate de saldos se mantiene en
        // "Calculando…" (seguro) en vez de calcular contra la ventana incompleta.
      }
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
    // liveIdsSignature: refetch solo al AGREGAR o ELIMINAR (cambia el set de IDs),
    // NO al editar campos (el merge con precedencia live ya refleja la edición).
  }, [userId, liveIdsSignature]);

  const transactions = useMemo(
    () => mergeTransactionsById(liveTransactions, fullTxs),
    [liveTransactions, fullTxs],
  );

  return {
    transactions,
    // Invitado (sin userId): no hay nada que fetchear → siempre asentado.
    settled: !userId || settledForUser === userId,
  };
}
