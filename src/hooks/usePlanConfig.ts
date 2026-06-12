/**
 * usePlanConfig — Persiste la configuración del plan financiero en Firestore.
 * Documento singleton: users/{userId}/settings/planConfig
 * Fallback a localStorage para modo guest.
 */

import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useLocalStorage } from './useLocalStorage';
import { logger } from '../utils/logger';
import type { PlanConfig } from './useFinancialPlan';

interface StoredPlanConfig {
  startMonth: string;
  declaredIncome: number;
}

export function usePlanConfig(userId: string | null) {
  const [config, setConfig] = useState<PlanConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Fallback localStorage para modo guest
  const [localConfig, setLocalConfig] = useLocalStorage<StoredPlanConfig | null>('financialPlanConfig', null);

  // Cargar desde Firestore (autenticado)
  useEffect(() => {
    if (!userId) return;
    const docRef = doc(db, `users/${userId}/settings/planConfig`);
    getDoc(docRef).then(snap => {
      if (snap.exists()) {
        const data = snap.data() as StoredPlanConfig;
        setConfig({ startMonth: data.startMonth, declaredIncome: data.declaredIncome });
      }
      setLoading(false);
    }).catch(error => {
      logger.error('Error cargando la configuración del plan', error);
      setLoading(false);
    });
  }, [userId]);

  // Cargar desde localStorage (invitado). Depende de localConfig porque la
  // hidratación de useLocalStorage es asíncrona (post-mount): sin esta dep el
  // plan guardado nunca se cargaba al recargar la app en modo invitado.
  useEffect(() => {
    if (userId) return;
    if (localConfig) {
      setConfig({ startMonth: localConfig.startMonth, declaredIncome: localConfig.declaredIncome });
    }
    setLoading(false);
  }, [userId, localConfig]);

  const saveConfig = useCallback(async (newConfig: PlanConfig) => {
    setConfig(newConfig);
    const data: StoredPlanConfig = { startMonth: newConfig.startMonth, declaredIncome: newConfig.declaredIncome };
    if (userId) {
      await setDoc(doc(db, `users/${userId}/settings/planConfig`), data);
    } else {
      setLocalConfig(data);
    }
  }, [userId, setLocalConfig]);

  const clearConfig = useCallback(async () => {
    setConfig(null);
    if (userId) {
      await deleteDoc(doc(db, `users/${userId}/settings/planConfig`));
    } else {
      setLocalConfig(null);
    }
  }, [userId, setLocalConfig]);

  return { config, loading, saveConfig, clearConfig };
}
