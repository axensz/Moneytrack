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

export function usePlanConfig(userId: string | null, authLoading = false) {
  const [config, setConfig] = useState<PlanConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Fallback localStorage para modo guest
  const [localConfig, setLocalConfig] = useLocalStorage<StoredPlanConfig | null>('financialPlanConfig', null);

  // Cargar desde Firestore (autenticado)
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    // Limpia de inmediato la config de un usuario anterior; se rellena al
    // resolver. Sin esto el plan del usuario previo se filtraba a la cuenta
    // nueva durante (y, si el doc no existe, después de) la carga (#6).
    setConfig(null);
    // Re-armar loading: si venimos de un render como invitado (loading ya en
    // false), al llegar el usuario hay que volver a tapar con skeleton hasta que
    // resuelva el getDoc; si no, el plan en caché parpadea como "Iniciar plan".
    setLoading(true);
    const docRef = doc(db, `users/${userId}/settings/planConfig`);
    getDoc(docRef).then(snap => {
      if (cancelled) return;
      // snap inexistente → null: la cuenta no tiene plan, no heredar el anterior.
      setConfig(snap.exists()
        ? { startMonth: (snap.data() as StoredPlanConfig).startMonth, declaredIncome: (snap.data() as StoredPlanConfig).declaredIncome }
        : null);
      setLoading(false);
    }).catch(error => {
      if (cancelled) return;
      logger.error('Error cargando la configuración del plan', error);
      setLoading(false);
    });
    // cancelled: evita que un getDoc lento de la cuenta A pise la config de B
    // si se cambia de usuario antes de resolver.
    return () => { cancelled = true; };
  }, [userId]);

  // Cargar desde localStorage (invitado). Depende de localConfig porque la
  // hidratación de useLocalStorage es asíncrona (post-mount): sin esta dep el
  // plan guardado nunca se cargaba al recargar la app en modo invitado.
  useEffect(() => {
    // No decidir "invitado sin plan" mientras la auth aún resuelve: en esa ventana
    // userId es null pero podría llegar un usuario. Si limpiáramos loading aquí, el
    // plan en caché parpadearía como "Iniciar plan" antes de cargar la config.
    if (userId || authLoading) return;
    // Invitado sin plan guardado → null: no heredar el plan de un usuario
    // autenticado anterior tras cerrar sesión (#6).
    setConfig(localConfig
      ? { startMonth: localConfig.startMonth, declaredIncome: localConfig.declaredIncome }
      : null);
    setLoading(false);
  }, [userId, localConfig, authLoading]);

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
