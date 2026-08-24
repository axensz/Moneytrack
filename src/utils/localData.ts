/**
 * Datos financieros del modo invitado guardados en localStorage.
 *
 * Estas claves NO están namespaced por usuario, así que persisten entre sesiones.
 * Al cerrar sesión se limpian para que, en un dispositivo compartido, el siguiente
 * usuario no vea datos del anterior (S2).
 */
import {
  GUEST_LEDGER_RECOVERY_KEY,
  GUEST_LEDGER_STORAGE_KEY,
} from './guestLedger';

export const GUEST_DATA_KEYS = [
  GUEST_LEDGER_STORAGE_KEY,
  GUEST_LEDGER_RECOVERY_KEY,
  'accounts',
  'transactions',
  'recurringPayments',
  'debts',
  'budgets',
  'financeCategories',
  'savingsGoals',
  'financialPlanConfig',
  'notifications',
  'notificationPreferences',
] as const;

/** Borra los datos financieros locales (modo invitado). Seguro si localStorage falla. */
export function clearGuestFinanceData(): void {
  if (typeof localStorage === 'undefined') return;
  for (const key of GUEST_DATA_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // localStorage no disponible (modo privado): ignorar
    }
  }
}
