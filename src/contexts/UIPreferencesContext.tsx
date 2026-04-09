'use client';

/**
 * UIPreferencesContext — Contexto liviano para preferencias de UI.
 *
 * Separado de FinanceContext para evitar que cambios en datos financieros
 * (transacciones, cuentas, etc.) provoquen re-renders en componentes
 * que solo necesitan hideBalances.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface UIPreferencesValue {
    hideBalances: boolean;
    setHideBalances: (hide: boolean) => void;
}

const UIPreferencesContext = createContext<UIPreferencesValue | null>(null);

export function UIPreferencesProvider({ children }: { children: React.ReactNode }) {
    const [hideBalances, setHideBalancesState] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('moneytrack_hide_values') === 'true';
        }
        return false;
    });

    useEffect(() => {
        localStorage.setItem('moneytrack_hide_values', String(hideBalances));
    }, [hideBalances]);

    const setHideBalances = useCallback((hide: boolean) => {
        setHideBalancesState(hide);
    }, []);

    return (
        <UIPreferencesContext.Provider value={{ hideBalances, setHideBalances }}>
            {children}
        </UIPreferencesContext.Provider>
    );
}

export function useUIPreferences(): UIPreferencesValue {
    const ctx = useContext(UIPreferencesContext);
    if (!ctx) {
        throw new Error('useUIPreferences must be used within UIPreferencesProvider');
    }
    return ctx;
}
