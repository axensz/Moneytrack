'use client';

import React, { useMemo, useRef, useState } from 'react';
import { PlusCircle, Link2, ChevronLeft } from 'lucide-react';
import { showToast } from '../../../../utils/toastHelpers';
import { logger } from '../../../../utils/logger';
import { formatNumberForInput, parseCurrency, unformatNumber } from '../../../../utils/formatters';
import type { Account, Debt, Transaction } from '../../../../types/finance';
import { getDebtLinkCandidates } from '../../../../utils/debtPaymentLink';
import { BaseModal } from '../../../modals/BaseModal';

interface LinkDebtPaymentModalProps {
  isOpen: boolean;
  debt: Debt | null;
  /** Historial completo confirmado (movimientos pagados para enlazar). */
  transactions: Transaction[];
  accounts?: Account[];
  formatCurrency: (amount: number) => string;
  onClose: () => void;
  /** Crea un pago nuevo y reduce el saldo (camino de hoy). */
  onRegister: (debtId: string, amount: number, paymentAccountId?: string) => Promise<void>;
  /** Enlaza una transacción existente como el pago del préstamo. */
  onLinkExisting: (debtId: string, transactionId: string, recurringCycle?: string) => Promise<void>;
  /**
   * Cuota periódica a saldar (opcional). Si está presente, el modal opera en
   * modo cuota: "Registrar" paga la cuota del ciclo con payDebtCycle y "Enlazar"
   * estampa ese recurringCycle. Ausente = pago normal (monto libre).
   */
  recurringCycle?: string | null;
  recurringPaymentAmount?: number;
  /** Paga la cuota del ciclo en un paso (crea movimiento + reduce saldo). */
  onPayCycle?: (debtId: string, recurringCycle: string, paymentAccountId?: string) => Promise<void>;
}

type Mode = 'choose' | 'register' | 'link';

/**
 * Modal de pago de préstamo con DOS caminos:
 *  - "Registrar pago ahora": crea el movimiento y reduce el saldo (registerDebtPayment).
 *  - "Enlazar transacción existente": marca un gasto/ingreso ya registrado como el
 *    pago del préstamo, sin crear un segundo movimiento (linkDebtPayment).
 * Calcado de MarkPaidModal; respeta el sistema de diseño (un violeta de marca,
 * targets táctiles >=44px, sin gradientes fuera de .btn-primary/.card-balance).
 */
export const LinkDebtPaymentModal: React.FC<LinkDebtPaymentModalProps> = ({
  isOpen,
  debt,
  transactions,
  accounts = [],
  formatCurrency,
  onClose,
  onRegister,
  onLinkExisting,
  recurringCycle,
  recurringPaymentAmount,
  onPayCycle,
}) => {
  const isRecurringMode = Boolean(recurringCycle && onPayCycle);
  const [mode, setMode] = useState<Mode>('choose');
  const [amount, setAmount] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // Reset al abrir.
  React.useEffect(() => {
    if (isOpen) {
      setMode('choose');
      setAmount('');
      setPaymentAccountId(debt?.accountId ?? '');
      setBusy(false);
      busyRef.current = false;
    }
  }, [isOpen, debt]);

  const candidates = useMemo(() => {
    return debt ? getDebtLinkCandidates(transactions, debt) : [];
  }, [transactions, debt]);

  const run = async (fn: () => Promise<void>, okMsg: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
      showToast.success(okMsg);
      onClose();
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'No se pudo guardar');
      logger.error('LinkDebtPaymentModal', error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleRegister = () => {
    if (!debt?.id) return;
    // Modo cuota: paga la cuota del ciclo en un paso (monto = cuota fija).
    if (isRecurringMode && recurringCycle && onPayCycle) {
      run(() => paymentAccountId && paymentAccountId !== debt.accountId ? onPayCycle(debt.id!, recurringCycle, paymentAccountId) : onPayCycle(debt.id!, recurringCycle), 'Cuota registrada');
      return;
    }
    const parsed = parseCurrency(amount);
    if (isNaN(parsed) || parsed <= 0) {
      showToast.error('El monto debe ser mayor a 0');
      return;
    }
    if (parsed > debt.remainingAmount) {
      showToast.error(`El pago no puede superar el saldo pendiente (${formatCurrency(debt.remainingAmount)})`);
      return;
    }
    run(() => paymentAccountId && paymentAccountId !== debt.accountId ? onRegister(debt.id!, parsed, paymentAccountId) : onRegister(debt.id!, parsed), 'Pago registrado');
  };

  return (
    <BaseModal
      isOpen={isOpen && !!debt}
      onClose={onClose}
      title={debt ? `${debt.personName} · ${formatCurrency(debt.remainingAmount)} pendiente` : undefined}
      maxWidth="max-w-lg"
    >
      {debt && (
        <div>
          {/* Volver al paso de elección desde registrar/enlazar */}
          {mode !== 'choose' && (
            <button
              onClick={() => setMode('choose')}
              className="flex items-center gap-1 -mt-1 mb-2 min-h-11 text-sm text-muted-foreground hover:text-foreground rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
                  <span className="block text-sm text-muted-foreground">Crea el movimiento y reduce el saldo del préstamo</span>
                </span>
              </button>

              <button
                onClick={() => setMode('link')}
                className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-border hover:border-border-accent transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Link2 size={22} className="text-muted-foreground flex-shrink-0" />
                <span>
                  <span className="block font-semibold text-gray-900 dark:text-gray-100">Enlazar transacción existente</span>
                  <span className="block text-sm text-muted-foreground">Ya lo registraste suelto: enlázalo sin duplicar el movimiento</span>
                </span>
              </button>
            </div>
          )}

          {/* ── Registrar pago nuevo ── */}
          {mode === 'register' && (
            <div className="mt-5 space-y-4">
              {accounts.length > 0 && (
                <div>
                  <label htmlFor="debt-payment-account" className="label-base">{debt.type === 'lent' ? 'Recibir el pago en' : 'Pagar desde'}</label>
                  <select id="debt-payment-account" className="input-base" value={paymentAccountId} onChange={event => setPaymentAccountId(event.target.value)} disabled={busy}>
                    {!debt.accountId && <option value="">Solo seguimiento</option>}
                    {accounts.filter(account => !account.archived || account.id === debt.accountId).map(account => <option key={account.id} value={account.id}>{account.name}{account.type === 'credit' ? ' · Tarjeta de crédito' : ''}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">Elige la cuenta donde ocurre el pago. La tarjeta usada al prestar conserva su propio saldo.</p>
                </div>
              )}
              {isRecurringMode ? (
                <div className="rounded-lg border border-border bg-muted p-3">
                  <span className="block text-xs text-muted-foreground">Cuota a registrar</span>
                  <span className="block text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {formatCurrency(Math.min(recurringPaymentAmount ?? 0, debt.remainingAmount))}
                  </span>
                </div>
              ) : (
                <div>
                  <label htmlFor="ldp-amount" className="label-base">¿Cuánto pagaste?</label>
                  <input
                    id="ldp-amount"
                    type="text"
                    inputMode="numeric"
                    value={formatNumberForInput(amount)}
                    onChange={(e) => setAmount(unformatNumber(e.target.value))}
                    placeholder="Monto del pago"
                    className="input-base"
                    autoFocus
                  />
                </div>
              )}
              <button
                onClick={handleRegister}
                disabled={busy}
                className={`btn-submit w-full ${busy ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {busy ? 'Guardando...' : isRecurringMode ? 'Registrar cuota' : 'Registrar pago'}
              </button>
            </div>
          )}

          {/* ── Enlazar existente ── */}
          {mode === 'link' && (
            <div className="mt-5">
              {candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No hay movimientos de la cuenta del préstamo sin enlazar para elegir.
                </p>
              ) : (
                <div className="space-y-2">
                  {candidates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => run(() => onLinkExisting(debt.id!, t.id!, recurringCycle ?? undefined), 'Transacción enlazada')}
                      disabled={busy}
                      className="w-full min-h-11 flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:border-border-accent hover:bg-primary/5 transition-colors text-left disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium text-gray-900 dark:text-gray-100 truncate">
                          {t.description || t.category}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {new Date(t.date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
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
