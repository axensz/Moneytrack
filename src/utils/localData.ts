/**
 * Datos financieros del modo invitado guardados en localStorage.
 *
 * Estas claves NO están namespaced por usuario, así que persisten entre sesiones.
 * Al cerrar sesión se limpian para que, en un dispositivo compartido, el siguiente
 * usuario no vea datos del anterior (S2).
 */
export const GUEST_DATA_KEYS = [
  'accounts',
  'transactions',
  'recurringPayments',
  'debts',
  'budgets',
  'financeCategories',
  'savingsGoals',
  'financialPlanConfig',
  'notifications',
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
