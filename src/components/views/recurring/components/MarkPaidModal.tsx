'use client';

import React, { useMemo, useState } from 'react';
import { X, PlusCircle, Link2, ChevronLeft } from 'lucide-react';
import { showToast } from '../../../../utils/toastHelpers';
import { logger } from '../../../../utils/logger';
import type { RecurringPayment, Account, Transaction } from '../../../../types/finance';
import { cycleKey } from '../../../../utils/recurringDates';

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

  if (!isOpen || !payment) return null;

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
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header estático: nombre + precio del periódico, siempre visible al scrollear */}
        <div className="flex justify-between items-center gap-2 p-5 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 min-w-0">
            {mode !== 'choose' && (
              <button
                onClick={() => setMode('choose')}
                aria-label="Volver"
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg flex-shrink-0"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
              {payment.name} · {formatCurrency(payment.amount)}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors p-2 rounded-xl min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">

          {/* ── Elegir acción ── */}
          {mode === 'choose' && (
            <div className="mt-5 space-y-3">
              <button
                onClick={() => setMode('register')}
                className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10 hover:border-purple-400 transition-colors text-left"
              >
                <PlusCircle size={22} className="text-purple-600 flex-shrink-0" />
                <span>
                  <span className="block font-semibold text-gray-900 dark:text-gray-100">Registrar pago ahora</span>
                  <span className="block text-sm text-gray-500 dark:text-gray-400">Crea el gasto y lo marca pagado este ciclo</span>
                </span>
              </button>

              <button
                onClick={() => setMode('link')}
                className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-gray-400 transition-colors text-left"
              >
                <Link2 size={22} className="text-gray-500 flex-shrink-0" />
                <span>
                  <span className="block font-semibold text-gray-900 dark:text-gray-100">Vincular transacción existente</span>
                  <span className="block text-sm text-gray-500 dark:text-gray-400">Ya lo pagaste: elige el gasto y se enlaza a este ciclo</span>
                </span>
              </button>
            </div>
          )}

          {/* ── Registrar pago nuevo ── */}
          {mode === 'register' && (
            <div className="mt-5 space-y-4">
              {accounts.length === 0 ? (
                <p className="text-sm text-rose-600">Crea una cuenta primero para registrar el pago.</p>
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
                <p className="text-sm text-gray-500 py-6 text-center">
                  No hay gastos recientes sin pago periódico para vincular.
                </p>
              ) : (
                <div className="space-y-2">
                  {candidates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => run(() => onLinkExisting(payment, t.id!), 'Transacción vinculada')}
                      disabled={busy}
                      className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-purple-400 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-colors text-left disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium text-gray-900 dark:text-gray-100 truncate">
                          {t.description || t.category}
                        </span>
                        <span className="block text-xs text-gray-500">
                          {new Date(t.date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        {t.recurringPaymentId === payment.id && (
                          <span className="block text-xs text-amber-600 dark:text-amber-400">
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
      </div>
    </div>
  );
};
