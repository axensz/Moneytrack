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
import { db } from '../lib/firebase';
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
  const [fullTxs, setFullTxs] = useState<Transaction[]>([]);

  // Firma que captura tanto altas/bajas como EDICIONES del array live. Antes el
  // refetch dependía solo de length, así que editar una transacción (que no
  // cambia el largo) dejaba el historial completo obsoleto en Stats (#18).
  // Incluimos los campos que afectan los agregados de Stats: monto, fecha,
  // categoría, tipo y estado de pago. Se ordena por id para que el resultado sea
  // estable ante reordenamientos del array.
  const liveSignature = useMemo(() => {
    return liveTransactions
      .map((t) => {
        const dateMs = t.date instanceof Date ? t.date.getTime() : new Date(t.date).getTime();
        return `${t.id}:${t.amount}:${dateMs}:${t.category}:${t.type}:${t.paid ? 1 : 0}`;
      })
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
        }
      } catch (err) {
        logger.error('Error cargando el historial completo de transacciones', err);
        // Degradación suave: el merge cae al array live.
      }
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
    // liveSignature: refetch al agregar, eliminar O editar una transacción.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, liveSignature]);

  return useMemo(
    () => mergeTransactionsById(liveTransactions, fullTxs),
    [liveTransactions, fullTxs],
  );
}
