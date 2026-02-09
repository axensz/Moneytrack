/**
 * Hook para manejar la subscripción en tiempo real de pagos periódicos
 */

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { logger } from '../../utils/logger';
import type { RecurringPayment } from '../../types/finance';

interface RecurringSubscriptionReturn {
  firestorePayments: RecurringPayment[];
  loading: boolean;
  error: Error | null;
}

export function useRecurringSubscription(
  userId: string | null
): RecurringSubscriptionReturn {
  const [firestorePayments, setFirestorePayments] = useState<RecurringPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setFirestorePayments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const paymentsRef = collection(db, `users/${userId}/recurringPayments`);
    const paymentsQuery = query(paymentsRef, orderBy('dueDay', 'asc'));

    const unsubscribe = onSnapshot(
      paymentsQuery,
      (snapshot) => {
        const paymentsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          lastPaidDate: doc.data().lastPaidDate?.toDate() || null,
          createdAt: doc.data().createdAt?.toDate() || new Date(),
        })) as RecurringPayment[];
        setFirestorePayments(paymentsData);
        setLoading(false);
      },
      (err) => {
        console.error('Error en pagos recurrentes:', err);
        setError(new Error(`Error al cargar pagos recurrentes: ${err.message}`));
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  return { firestorePayments, loading, error };
}
