import React from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarClock } from 'lucide-react';
import { formatCurrency, formatDate, formatDateForInput, formatNumberForInput, unformatNumber } from '../../../../utils/formatters';
import type { Account, Transaction } from '../../../../types/finance';
import { getDebtFormFinancials, type DebtFormData } from '../utils/debtForm';
import { isDebtPrincipalCandidate } from '../../../../utils/debtInterest';
import { INSTALLMENT_OPTIONS } from '../../../../utils/interestCalculator';
import { ensureDate } from '../../../../utils/dateUtils';
import type { PaymentScheduleFormState } from '../utils/paymentScheduleForm';
import { PaymentScheduleFields } from './PaymentScheduleFields';
import { calculateMonthlyInterestCharge } from '../../../../../functions/src/shared/debtMonthlyInterest';

export interface DebtFormErrors {
  personName?: string;
  originalAmount?: string;
  paymentSchedule?: string;
  interest?: string;
}

interface NewDebtFormProps {
  accounts: Account[];
  transactions: Transaction[];
  errors: DebtFormErrors;
  formData: DebtFormData;
  isSubmitting: boolean;
  paymentSchedule: PaymentScheduleFormState;
  onCancel: () => void;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  setFormData: React.Dispatch<React.SetStateAction<DebtFormData>>;
  setPaymentSchedule: React.Dispatch<React.SetStateAction<PaymentScheduleFormState>>;
}

export const NewDebtForm: React.FC<NewDebtFormProps> = ({
  accounts,
  transactions,
  errors,
  formData,
  isSubmitting,
  paymentSchedule,
  onCancel,
  onSubmit,
  setFormData,
  setPaymentSchedule,
}) => {
  const source = transactions.find(t => t.id === formData.existingTransactionId);
  const selectedAccount = accounts.find(account => account.id === (source?.accountId ?? formData.accountId));
  const isCreditSelected = selectedAccount?.type === 'credit';
  const interestMode = source?.hasInterest ? 'card' : formData.interestMode;
  const supportsMonthlyInterest = interestMode === 'card' || interestMode === 'percentage';
  const isMonthlyInterest = supportsMonthlyInterest && formData.interestAccrual === 'monthly';
  const cardRate = source?.hasInterest ? source.interestRate ?? selectedAccount?.interestRate : selectedAccount?.interestRate;
  const candidates = transactions.filter(t => isDebtPrincipalCandidate(t, formData.type));
  let preview: ReturnType<typeof getDebtFormFinancials> | null = null;
  try { preview = getDebtFormFinancials(formData, accounts, transactions); } catch { /* El envío muestra el error junto al campo. */ }
  const changeSource = (id: string) => {
    const transaction = transactions.find(t => t.id === id);
    setFormData(form => ({
      ...form, existingTransactionId: id, interestMode: transaction?.hasInterest ? 'card' : 'none', interestAccrual: 'upfront', interestValue: '', installments: transaction?.installments ?? 1,
      ...(transaction ? {
        accountId: transaction.accountId,
        originalAmount: String(transaction.amount),
        lentDate: formatDateForInput(ensureDate(transaction.date)),
      } : {}),
    }));
  };

  return (
    <form
      aria-labelledby="new-debt-form-title"
      className="rounded-xl border border-border bg-muted/60 dark:bg-gray-800/50 p-4 sm:p-5 mb-6 space-y-4 shadow-sm"
      onSubmit={onSubmit}
      noValidate
    >
      <h4 id="new-debt-form-title" className="sr-only">Registrar préstamo o deuda</h4>

      <fieldset>
        <legend className="sr-only">Tipo de movimiento</legend>
        <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border bg-background/60 dark:bg-gray-900/50 p-1">
          <button
            type="button"
            aria-pressed={formData.type === 'lent'}
            onClick={() => setFormData(form => ({ ...form, type: 'lent', existingTransactionId: '' }))}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${formData.type === 'lent'
              ? 'bg-primary-solid text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            }`}
          >
            <ArrowUpRight size={16} className="shrink-0" aria-hidden="true" />
            <span>Yo presté</span>
          </button>
          <button
            type="button"
            aria-pressed={formData.type === 'borrowed'}
            onClick={() => setFormData(form => ({ ...form, type: 'borrowed', existingTransactionId: '' }))}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${formData.type === 'borrowed'
              ? 'bg-primary-solid text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            }`}
          >
            <ArrowDownLeft size={16} className="shrink-0" aria-hidden="true" />
            <span>Me prestaron</span>
          </button>
        </div>
      </fieldset>

      <div>
        <label htmlFor="new-debt-source" className="block text-xs font-medium text-muted-foreground mb-1">
          Transacción existente <span className="font-normal">(opcional)</span>
        </label>
        <select id="new-debt-source" value={formData.existingTransactionId} onChange={event => changeSource(event.target.value)} className="input-base">
          <option value="">Registrar un movimiento nuevo</option>
          {candidates.map(transaction => (
            <option key={transaction.id} value={transaction.id}>
              {formatDate(transaction.date)} · {transaction.description || transaction.category} · {formatCurrency(transaction.amount)} · {accounts.find(a => a.id === transaction.accountId)?.name ?? 'Cuenta'}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">{source ? 'Se usará este movimiento con su cuenta, tarjeta y cuotas. El dinero no se registrará de nuevo.' : `Puedes asociar ${formData.type === 'lent' ? 'un gasto' : 'un ingreso'} ya pagado que no esté vinculado a otro préstamo o pago.`}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="new-debt-person" className="block text-xs font-medium text-muted-foreground mb-1">
            Nombre de la persona
          </label>
          <input
            id="new-debt-person"
            type="text"
            value={formData.personName}
            onChange={event => setFormData(form => ({ ...form, personName: event.target.value }))}
            placeholder="Nombre de la persona"
            className="input-base"
            aria-invalid={Boolean(errors.personName)}
            aria-describedby={errors.personName ? 'new-debt-person-error' : undefined}
          />
          {errors.personName && <p id="new-debt-person-error" role="alert" className="mt-1 text-xs text-destructive">{errors.personName}</p>}
        </div>

        <div>
          <label htmlFor="new-debt-amount" className="block text-xs font-medium text-muted-foreground mb-1">Monto</label>
          <input
            id="new-debt-amount"
            type="text"
            inputMode="numeric"
            value={formatNumberForInput(formData.originalAmount)}
            onChange={event => setFormData(form => ({ ...form, originalAmount: unformatNumber(event.target.value) }))}
            placeholder="Monto"
            className="input-base"
            disabled={Boolean(source)}
            aria-invalid={Boolean(errors.originalAmount)}
            aria-describedby={errors.originalAmount ? 'new-debt-amount-error' : undefined}
          />
          {errors.originalAmount && <p id="new-debt-amount-error" role="alert" className="mt-1 text-xs text-destructive">{errors.originalAmount}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="new-debt-description" className="block text-xs font-medium text-muted-foreground mb-1">
            Descripción <span className="font-normal">(opcional)</span>
          </label>
          <input id="new-debt-description" type="text" value={formData.description} onChange={event => setFormData(form => ({ ...form, description: event.target.value }))} placeholder="Descripción (opcional)" className="input-base" />
        </div>

        <div>
          <label htmlFor="new-debt-account" className="block text-xs font-medium text-muted-foreground mb-1">
            Cuenta asociada o tarjeta <span className="font-normal">(opcional)</span>
          </label>
          <select id="new-debt-account" disabled={Boolean(source)} value={formData.accountId} onChange={event => setFormData(form => ({ ...form, accountId: event.target.value }))} className="input-base">
            <option value="">Sin cuenta asociada (solo seguimiento)</option>
            {accounts.filter(account => !account.archived || account.id === formData.accountId).map(account => (
              <option key={account.id} value={account.id}>
                {account.name}{account.type === 'credit' ? ' (Tarjeta de crédito)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        {source ? 'Se conservará la cuenta del movimiento original. Los próximos pagos usarán esta cuenta.' : !formData.accountId
          ? 'Si eliges una cuenta, el préstamo y sus pagos moverán su saldo automáticamente.'
          : isCreditSelected
            ? (formData.type === 'lent'
                ? 'Se cargará a tu tarjeta (consume cupo). Los cobros abonarán a la tarjeta y liberan cupo.'
                : 'Se abonará a tu tarjeta (reduce el saldo usado). Los pagos volverán a cargarla.')
            : (formData.type === 'lent'
                ? 'Se registrará un gasto en esa cuenta (sale el dinero). Los cobros entrarán como ingreso.'
                : 'Se registrará un ingreso en esa cuenta (entra el dinero). Los pagos saldrán como gasto.')}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="new-debt-lent-date" className="block text-xs font-medium text-muted-foreground mb-1">
            {formData.type === 'lent' ? 'Fecha del préstamo' : 'Fecha en que recibí'}
          </label>
          <input id="new-debt-lent-date" type="date" disabled={Boolean(source)} value={formData.lentDate} onChange={event => setFormData(form => ({ ...form, lentDate: event.target.value }))} className="input-base" />
        </div>
        <div>
          <label htmlFor="new-debt-due-date" className="block text-xs font-medium text-muted-foreground mb-1">
            Vencimiento <span className="font-normal">(opcional)</span>
          </label>
          <input id="new-debt-due-date" type="date" value={formData.dueDate} onChange={event => setFormData(form => ({ ...form, dueDate: event.target.value }))} className="input-base" />
        </div>
      </div>

      <div className="space-y-2 border-t border-border pt-3" aria-labelledby="new-debt-payment-schedule-label">
        <p id="new-debt-payment-schedule-label" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CalendarClock size={14} aria-hidden="true" />
          <span>Próximo pago <span className="font-normal">(opcional)</span></span>
        </p>
        <PaymentScheduleFields value={paymentSchedule} onChange={setPaymentSchedule} />
        {errors.paymentSchedule && <p id="new-debt-schedule-error" role="alert" className="text-xs text-destructive">{errors.paymentSchedule}</p>}
      </div>

      <div className="space-y-3 border-t border-border pt-3">
        {source?.hasInterest ? (
          <p className="text-xs text-foreground">Tasa y cuotas tomadas de la transacción original. Puedes elegir cuándo agregar el interés al préstamo.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="new-debt-interest" className="block text-xs font-medium text-muted-foreground mb-1">Interés</label>
              <select id="new-debt-interest" value={formData.interestMode} onChange={event => {
                const interestMode = event.target.value as DebtFormData['interestMode'];
                setFormData(form => ({ ...form, interestMode, interestAccrual: interestMode === 'card' || interestMode === 'percentage' ? form.interestAccrual : 'upfront' }));
              }} className="input-base" aria-describedby="new-debt-interest-help">
                <option value="none">Sin interés</option>
                <option value="fixed">Monto fijo</option>
                <option value="percentage">Porcentaje del préstamo</option>
                <option value="card" disabled={!isCreditSelected}>Tasa guardada de la tarjeta</option>
              </select>
            </div>
            {(formData.interestMode === 'fixed' || formData.interestMode === 'percentage') && (
              <div>
                <label htmlFor="new-debt-interest-value" className="block text-xs font-medium text-muted-foreground mb-1">{formData.interestMode === 'fixed' ? 'Monto del interés' : isMonthlyInterest ? 'Porcentaje mensual (%)' : 'Porcentaje total (%)'}</label>
                <input id="new-debt-interest-value" type="text" inputMode="decimal" className="input-base" value={formData.interestMode === 'fixed' ? formatNumberForInput(formData.interestValue) : formData.interestValue} onChange={event => setFormData(form => ({ ...form, interestValue: form.interestMode === 'fixed' ? unformatNumber(event.target.value) : event.target.value }))} aria-invalid={Boolean(errors.interest)} aria-describedby={errors.interest ? 'new-debt-interest-error' : 'new-debt-interest-help'} />
              </div>
            )}
            {formData.interestMode === 'card' && !isMonthlyInterest && (
              <div>
                <label htmlFor="new-debt-installments" className="block text-xs font-medium text-muted-foreground mb-1">Cuotas de la tarjeta</label>
                <select id="new-debt-installments" className="input-base" value={formData.installments} disabled={source?.installments !== undefined} onChange={event => setFormData(form => ({ ...form, installments: Number(event.target.value) }))}>
                  {INSTALLMENT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">A una cuota se considera sin intereses, igual que las compras de la tarjeta.</p>
              </div>
            )}
          </div>
        )}
        {supportsMonthlyInterest && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="new-debt-interest-accrual" className="block text-xs font-medium text-muted-foreground mb-1">Cuándo agregar el interés</label>
              <select id="new-debt-interest-accrual" value={formData.interestAccrual} onChange={event => setFormData(form => ({ ...form, interestAccrual: event.target.value as DebtFormData['interestAccrual'] }))} className="input-base" aria-describedby="new-debt-interest-help">
                <option value="upfront">Todo al registrar</option>
                <option value="monthly">Cada mes en el día de corte</option>
              </select>
            </div>
            {isMonthlyInterest && interestMode !== 'card' && (
              <div>
                <label htmlFor="new-debt-interest-cutoff" className="block text-xs font-medium text-muted-foreground mb-1">Día de corte del interés</label>
                <select id="new-debt-interest-cutoff" value={formData.interestCutoffDay} onChange={event => setFormData(form => ({ ...form, interestCutoffDay: event.target.value }))} className="input-base" aria-describedby="new-debt-interest-cutoff-help" aria-invalid={Boolean(errors.interest)}>
                  {Array.from({ length: 31 }, (_, index) => index + 1).map(day => <option key={day} value={day}>Día {day}</option>)}
                </select>
                <p id="new-debt-interest-cutoff-help" className="mt-1 text-xs text-muted-foreground">Si el día no existe en un mes, se usa el último día de ese mes.</p>
              </div>
            )}
          </div>
        )}
        {interestMode === 'card' && <p className="text-xs text-muted-foreground">Tasa {source?.hasInterest ? 'de la transacción' : 'guardada'}: {cardRate !== undefined ? `${cardRate.toLocaleString('es-CO')}% E.A.` : 'Sin configurar en Cuentas'}.</p>}
        {isMonthlyInterest && interestMode === 'card' && (
          <p className="text-xs text-muted-foreground">{selectedAccount?.cutoffDay ? `Día ${selectedAccount.cutoffDay} de cada mes, según el corte de la tarjeta.` : 'Configura el día de corte de esta tarjeta en Cuentas.'}</p>
        )}
        <p id="new-debt-interest-help" className="text-xs text-muted-foreground">{isMonthlyInterest
          ? 'Cada mes se agrega interés sobre el capital original, sin interés compuesto. Los abonos no cambian esa base. El primer corte es posterior al préstamo; al saldarlo se detienen los cargos. Solo aumenta el saldo del préstamo, sin crear movimientos de dinero.'
          : 'El interés se calcula una sola vez y se suma al saldo pendiente. La tasa de tarjeta estima cuotas mensuales; el valor queda fijo al registrar.'}</p>
        {errors.interest && <p id="new-debt-interest-error" role="alert" className="text-xs text-destructive">{errors.interest}</p>}
        {preview && (
          <div className="rounded-lg border border-border bg-background/50 dark:bg-gray-900/40 p-3 text-sm" aria-live="polite">
            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              <div><dt className="text-xs text-muted-foreground">Capital</dt><dd className="font-mono text-foreground">{formatCurrency(preview.originalAmount)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">{isMonthlyInterest ? 'Interés agregado hasta hoy' : formData.type === 'lent' ? 'Interés a cobrar' : 'Interés a pagar'}</dt><dd className="font-mono text-foreground">{formatCurrency(preview.totalInterestAmount ?? 0)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">{formData.type === 'lent' ? 'Total a cobrar' : 'Total a pagar'}</dt><dd className="font-mono font-semibold text-foreground">{formatCurrency(preview.remainingAmount)}</dd></div>
              {isMonthlyInterest && (preview.interestMode === 'card' || preview.interestMode === 'percentage') && preview.interestRate !== undefined && <div><dt className="text-xs text-muted-foreground">Interés por cada corte</dt><dd className="font-mono text-foreground">{formatCurrency(calculateMonthlyInterestCharge(preview.originalAmount, preview.interestMode, preview.interestRate))}</dd></div>}
              {isMonthlyInterest && preview.nextInterestDate && <div><dt className="text-xs text-muted-foreground">Próximo corte</dt><dd className="text-foreground">{formatDate(preview.nextInterestDate)}</dd></div>}
            </dl>
            {preview.installments && <p className="mt-2 text-xs text-muted-foreground">{preview.installments} cuota{preview.installments !== 1 ? 's' : ''}{preview.monthlyInstallmentAmount ? ` · ${formatCurrency(preview.monthlyInstallmentAmount)} por cuota (referencia)` : ''}</p>}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-1">
        <button type="submit" disabled={isSubmitting} className="btn-submit flex-1 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
          {isSubmitting ? 'Guardando...' : 'Registrar'}
        </button>
        <button type="button" onClick={onCancel} disabled={isSubmitting} className="btn-cancel flex-1 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
          Cancelar
        </button>
      </div>
    </form>
  );
};
