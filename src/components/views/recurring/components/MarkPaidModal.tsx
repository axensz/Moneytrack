'use client';

import React, { useMemo, useState } from 'react';
import { PlusCircle, Link2, ChevronLeft } from 'lucide-react';
import { showToast } from '../../../../utils/toastHelpers';
import { logger } from '../../../../utils/logger';
import type { RecurringPayment, Account, Transaction } from '../../../../types/finance';
import { cycleKey } from '../../../../utils/recurringDates';
import { BaseModal } from '../../../modals/BaseModal';

interface MarkPaidModalProps {
  isOpen: boolean;
  payment: RecurringPayment | null;
  accounts: Account[];
  /** Ventana paginada de transacciones (gastos recientes para vincular). */
  transactions: Transaction[];
  defaultAccountId?: string;
  formatCurrency: (amount: number) => string;
  onClose: () => void;
  /** Registra un gasto nuevo ya pagado y lo enlaza al ciclo actual. */
  onRegister: (payment: RecurringPayment, accountId: string) => Promise<void>;
  /** Vincula una transacción existente al pago y al ciclo actual. */
  onLinkExisting: (payment: RecurringPayment, transactionId: string) => Promise<void>;
}

type Mode = 'choose' | 'register' | 'link';

/**
 * Modal "Ya pagó": registra un pago nuevo o vincula una transacción existente
 * al ciclo actual del pago periódico. Ambos caminos estampan recurringCycle, así
 * que el pago aparece como pagado sin importar la fecha (ver cycleKey).
 */
export const MarkPaidModal: React.FC<MarkPaidModalProps> = ({
  isOpen,
  payment,
  accounts,
  transactions,
  defaultAccountId,
  formatCurrency,
  onClose,
  onRegister,
  onLinkExisting,
}) => {
  const [mode, setMode] = useState<Mode>('choose');
  const [accountId, setAccountId] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset al abrir.
  React.useEffect(() => {
    if (isOpen) {
      setMode('choose');
      setAccountId(payment?.accountId || defaultAccountId || accounts[0]?.id || '');
      setBusy(false);
    }
  }, [isOpen, payment, defaultAccountId, accounts]);

  // Candidatos a vincular: gastos SIN periódico, MÁS los ya ligados a ESTE pago
  // que aún no cubren el ciclo actual (p. ej. un pago creado desde el formulario
  // que quedó atribuido a otro ciclo por su fecha). Al elegirlo, onLinkExisting
  // re-estampa el ciclo actual → marca pagado sin duplicar el gasto.
  // ponytail: solo la ventana paginada en memoria (gastos recientes), suficiente
  // para un pago reciente.
  const candidates = useMemo(() => {
    const currentKey = payment ? cycleKey(payment, new Date()) : '';
    return transactions
      .filter((t) => {
        if (t.type !== 'expense') return false;
        if (!t.recurringPaymentId) return true;
        if (t.recurringPaymentId !== payment?.id) return false; // ligado a otro pago
        return t.recurringCycle !== currentKey; // ligado a este pago, otro ciclo
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 30);
  }, [transactions, payment]);

  const run = async (fn: () => Promise<void>, okMsg: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      showToast.success(okMsg);
      onClose();
    } catch (error) {
      showToast.error('No se pudo guardar');
      logger.error('MarkPaidModal', error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen && !!payment}
      onClose={onClose}
      title={payment ? `${payment.name} · ${formatCurrency(payment.amount)}` : undefined}
      maxWidth="max-w-lg"
    >
      {payment && (
        <div>
          {/* Volver al paso de elección desde registrar/vincular */}
          {mode !== 'choose' && (
            <button
              onClick={() => setMode('choose')}
              className="flex items-center gap-1 -mt-1 mb-2 text-sm text-muted-foreground hover:text-foreground rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronLeft size={18} />
              Volver
            </button>
          )}

          {/* ── Elegir acción ── */}
          {mode === 'choose' && (
            <div className="mt-5 space-y-3">
              <button
                onClick={() => setMode('register')}
                className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-border-accent bg-primary/5 hover:border-primary transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <PlusCircle size={22} className="text-primary flex-shrink-0" />
                <span>
                  <span className="block font-semibold text-gray-900 dark:text-gray-100">Registrar pago ahora</span>
                  <span className="block text-sm text-muted-foreground">Crea el gasto y lo marca pagado este ciclo</span>
                </span>
              </button>

              <button
                onClick={() => setMode('link')}
                className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-border hover:border-border-accent transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Link2 size={22} className="text-muted-foreground flex-shrink-0" />
                <span>
                  <span className="block font-semibold text-gray-900 dark:text-gray-100">Vincular transacción existente</span>
                  <span className="block text-sm text-muted-foreground">Ya lo pagaste: elige el gasto y se enlaza a este ciclo</span>
                </span>
              </button>
            </div>
          )}

          {/* ── Registrar pago nuevo ── */}
          {mode === 'register' && (
            <div className="mt-5 space-y-4">
              {accounts.length === 0 ? (
                <p className="text-sm text-destructive">Crea una cuenta primero para registrar el pago.</p>
              ) : (
                <>
                  <div>
                    <label htmlFor="mp-account" className="label-base">¿Desde qué cuenta pagaste?</label>
                    <select
                      id="mp-account"
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      className="input-base"
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => run(() => onRegister(payment, accountId), 'Pago registrado')}
                    disabled={busy || !accountId}
                    className={`btn-submit w-full ${busy || !accountId ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    {busy ? 'Guardando...' : `Registrar ${formatCurrency(payment.amount)}`}
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Vincular existente ── */}
          {mode === 'link' && (
            <div className="mt-5">
              {candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No hay gastos recientes sin pago periódico para vincular.
                </p>
              ) : (
                <div className="space-y-2">
                  {candidates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => run(() => onLinkExisting(payment, t.id!), 'Transacción vinculada')}
                      disabled={busy}
                      className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:border-border-accent hover:bg-primary/5 transition-colors text-left disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium text-gray-900 dark:text-gray-100 truncate">
                          {t.description || t.category}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {new Date(t.date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        {t.recurringPaymentId === payment.id && (
                          <span className="block text-xs text-warning">
                            Ya registrada · se moverá a este ciclo
                          </span>
                        )}
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100 flex-shrink-0">
                        {formatCurrency(t.amount)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </BaseModal>
  );
};
