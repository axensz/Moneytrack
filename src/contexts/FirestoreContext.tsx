'use client';

/**
 * FirestoreContext — Singleton de listeners Firestore
 *
 * PROBLEMA RESUELTO:
 * Antes, useTransactions, useAccounts y useCategories llamaban cada uno
 * a useFirestore(userId) de forma independiente, triplicando los listeners
 * de Firestore (3× lecturas y costos).
 *
 * SOLUCIÓN:
 * Un único Provider que llama useFirestore una sola vez.
 * Los hooks consumen los datos y operaciones CRUD vía Context.
 */

import React, { createContext, useContext } from 'react';
import { useFirestore } from '../hooks/useFirestore';

type FirestoreContextValue = ReturnType<typeof useFirestore>;

const FirestoreContext = createContext<FirestoreContextValue | null>(null);

interface FirestoreProviderProps {
  userId: string | null;
  children: React.ReactNode;
}

export function FirestoreProvider({ userId, children }: FirestoreProviderProps) {
  const firestore = useFirestore(userId);
  return (
    <FirestoreContext.Provider value={firestore}>
      {children}
    </FirestoreContext.Provider>
  );
}

/**
 * Hook para consumir datos y operaciones de Firestore desde el Context.
 * Debe usarse dentro de un <FirestoreProvider>.
 */
export function useFirestoreData(): FirestoreContextValue {
  const context = useContext(FirestoreContext);
  if (!context) {
    throw new Error('useFirestoreData must be used within a FirestoreProvider');
  }
  return context;
}
