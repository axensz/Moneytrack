import React, { useEffect, useMemo, memo, useState, useCallback } from 'react';
import { ChevronDown, CreditCard, Repeat, Zap, AlertTriangle } from 'lucide-react';
import { BaseModal } from '@/components/modals/BaseModal';
import { UI_LABELS, TRANSFER_CATEGORY } from '@/config/constants';
import { UI_TEXT } from '@/config/ui';
import { formatCurrency, formatDate, formatNumberForInput, unformatNumber, parseCurrency } from '@/utils/formatters';
import { getCreditCardUsedCredit } from '@/utils/accountStrategies';
import { INSTALLMENT_OPTIONS, calculateInterest } from '@/utils/interestCalculator';
import { detectDuplicates, type DuplicateMatch } from '@/utils/duplicateDetector';
import type { NewTransaction } from '@/types/finance';
import { useTransactionDomain, useAccountDomain, useBeneficiaryDomain, useCategoryDomain, useRecurringDomain } from '@/hooks/useFinanceSelectors';

interface TransactionFormProps {
  isOpen?: boolean;
  newTransaction: NewTransaction;
  setNewTransaction: React.Dispatch<React.SetStateAction<NewTransaction>>;
  onSubmit: () => void;
  onSubmitAndContinue?: () => void;
  onCancel: () => void;
  batchCount?: number;
}

const OFFICIAL_TRM_URL = 'https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC';

export const TransactionForm: React.FC<TransactionFormProps> = memo(({
  isOpen = true,
  newTransaction,
  setNewTransaction,
  onSubmit,
  onSubmitAndContinue,
  onCancel,
  batchCount = 0,
}) => {
  const { accounts, defaultAccount } = useAccountDomain();
  const { transactions, balanceTransactions } = useTransactionDomain();
  const { categories } = useCategoryDomain();
  const { beneficiaries } = useBeneficiaryDomain();
  const { recurringPayments } = useRecurringDomain();
  // Obtener cuenta seleccionada para validar restricciones
  const selectedAccount = accounts.find(acc => acc.id === newTransaction.accountId) || defaultAccount;
  const isCreditCard = selectedAccount?.type === 'credit';
  const supportsForeignCurrency = isCreditCard && newTransaction.type === 'expense';
  const selectedCurrency = newTransaction.currency || 'COP';
  const typedAmount = parseCurrency(String(newTransaction.amount || ''));
  const exchangeRate = parseCurrency(String(newTransaction.exchangeRate || ''));
  const convertedAmount = selectedCurrency === 'USD' &&
    Number.isFinite(typedAmount) &&
    Number.isFinite(exchangeRate) &&
    exchangeRate > 0
      ? typedAmount * exchangeRate
      : null;

  // Calcular cupo usado si es TC y está pagando
  const creditUsed = useMemo(() => {
    if (isCreditCard && newTransaction.type === 'income' && selectedAccount) {
      return getCreditCardUsedCredit(selectedAccount, balanceTransactions);
    }
    return 0;
  }, [isCreditCard, newTransaction.type, selectedAccount, balanceTransactions]);

  // Previsualización del costo de las cuotas en el momento de decidir:
  // muestra cuota mensual, interés total y total a pagar antes de guardar.
  const installmentPreview = useMemo(() => {
    if (!isCreditCard || newTransaction.type !== 'expense') return null;
    const installments = Number(newTransaction.installments) || 1;
    if (installments <= 1) return null;

    const principal = convertedAmount ?? parseCurrency(String(newTransaction.amount));
    if (!principal || principal <= 0) return null;

    const annualRate = selectedAccount?.interestRate || 0;
    const hasRate = annualRate > 0;
    const wantsInterest = !!newTransaction.hasInterest;
    // Si el usuario quiere intereses pero la cuenta no tiene tasa configurada,
    // no podemos estimar; lo avisamos en el render.
    const missingRate = wantsInterest && !hasRate;

    try {
      const result = calculateInterest(principal, annualRate, installments, wantsInterest && hasRate);
      return { ...result, installments, wantsInterest: wantsInterest && hasRate, missingRate };
    } catch {
      return null;
    }
  }, [isCreditCard, newTransaction.type, newTransaction.installments, newTransaction.amount, newTransaction.hasInterest, selectedAccount?.interestRate, convertedAmount]);

  // Efecto: Inicializar accountId con defaultAccount si está vacío
  useEffect(() => {
    if (!newTransaction.accountId && defaultAccount?.id) {
      const id = defaultAccount.id;
      setNewTransaction(prev => ({ ...prev, accountId: id }));
    }
  }, [newTransaction.accountId, defaultAccount?.id, setNewTransaction]);

  // Efecto: Si cambia a TC y está en "transfer", cambiar a "expense"
  useEffect(() => {
    if (isCreditCard && newTransaction.type === 'transfer') {
      setNewTransaction(prev => ({ ...prev, type: 'expense', toAccountId: '' }));
    }
  }, [isCreditCard, newTransaction.type, setNewTransaction]);

  useEffect(() => {
    if (!supportsForeignCurrency && selectedCurrency !== 'COP') {
      setNewTransaction(prev => ({ ...prev, currency: 'COP', exchangeRate: '' }));
    }
  }, [supportsForeignCurrency, selectedCurrency, setNewTransaction]);

  // Detección de duplicados: solo al intentar enviar (no en tiempo real)
  const [pendingDuplicates, setPendingDuplicates] = useState<DuplicateMatch[]>([]);
  const [pendingAction, setPendingAction] = useState<'submit' | 'continue' | null>(null);
  const [isFetchingTrm, setIsFetchingTrm] = useState(false);
  const [officialTrmError, setOfficialTrmError] = useState('');
  const [officialTrmApplied, setOfficialTrmApplied] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isInstallmentOpen, setIsInstallmentOpen] = useState(false);

  const hasAdditionalDetails = Boolean(
    newTransaction.beneficiary ||
    newTransaction.recurringPaymentId
  );

  const detailsDateLabel = useMemo(() => {
    const [year, month, day] = newTransaction.date.split('-').map(Number);
    if (!year || !month || !day) return 'Sin fecha';

    const today = new Date();
    if (
      year === today.getFullYear() &&
      month === today.getMonth() + 1 &&
      day === today.getDate()
    ) {
      return 'Hoy';
    }

    return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' })
      .format(new Date(year, month - 1, day));
  }, [newTransaction.date]);

  useEffect(() => {
    if (hasAdditionalDetails) setIsDetailsOpen(true);
  }, [hasAdditionalDetails]);

  useEffect(() => {
    if (newTransaction.installments > 1 || newTransaction.hasInterest) {
      setIsInstallmentOpen(true);
    }
  }, [newTransaction.hasInterest, newTransaction.installments]);

  const trmStatusText = officialTrmError ||
    (convertedAmount
      ? `${officialTrmApplied ? 'TRM oficial aplicada. ' : ''}Se registra en COP: ${formatCurrency(convertedAmount)}`
      : (officialTrmApplied ? 'TRM oficial aplicada' : 'Convierte el gasto a COP para cupo y reportes'));

  const handleCurrencyChange = useCallback((currency: 'COP' | 'USD') => {
    setOfficialTrmError('');
    setOfficialTrmApplied(false);
    setNewTransaction(prev => ({
      ...prev,
      currency,
      exchangeRate: currency === 'COP' ? '' : prev.exchangeRate,
    }));
  }, [setNewTransaction]);

  const handleExchangeRateChange = useCallback((value: string) => {
    setOfficialTrmError('');
    setOfficialTrmApplied(false);
    setNewTransaction(prev => ({ ...prev, exchangeRate: unformatNumber(value) }));
  }, [setNewTransaction]);

  useEffect(() => {
    if (!supportsForeignCurrency || selectedCurrency !== 'USD') {
      setOfficialTrmError('');
      setOfficialTrmApplied(false);
    }
  }, [supportsForeignCurrency, selectedCurrency]);

  const handleUseOfficialTrm = useCallback(async () => {
    setIsFetchingTrm(true);
    setOfficialTrmError('');
    setOfficialTrmApplied(false);
    try {
      const response = await fetch(OFFICIAL_TRM_URL);
      if (!response.ok) throw new Error('TRM request failed');
      const data = await response.json() as Array<{ valor?: string }>;
      const rate = Number(data[0]?.valor);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid TRM response');
      setNewTransaction(prev => ({ ...prev, exchangeRate: rate.toString() }));
      setOfficialTrmApplied(true);
    } catch {
      const hasManualRate = parseCurrency(String(newTransaction.exchangeRate || '')) > 0;
      setOfficialTrmError(hasManualRate
        ? 'No se pudo consultar la TRM oficial. La tasa actual queda manual.'
        : 'No se pudo consultar la TRM oficial. Ingresa la tasa manualmente.'
      );
    } finally {
      setIsFetchingTrm(false);
    }
  }, [newTransaction.exchangeRate, setNewTransaction]);

  const checkDuplicatesAndSubmit = useCallback((action: 'submit' | 'continue') => {
    const matches = detectDuplicates(newTransaction, transactions);
    if (matches.length > 0) {
      setPendingDuplicates(matches);
      setPendingAction(action);
    } else {
      // Sin duplicados, enviar directamente
      if (action === 'submit') onSubmit();
      else onSubmitAndContinue?.();
    }
  }, [newTransaction, transactions, onSubmit, onSubmitAndContinue]);

  const handleConfirmDuplicate = useCallback(() => {
    setPendingDuplicates([]);
    if (pendingAction === 'submit') onSubmit();
    else onSubmitAndContinue?.();
    setPendingAction(null);
  }, [pendingAction, onSubmit, onSubmitAndContinue]);

  const handleCancelDuplicate = useCallback(() => {
    setPendingDuplicates([]);
    setPendingAction(null);
  }, []);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onCancel}
      title={UI_TEXT.titles.newTransaction}
      maxWidth="max-w-4xl"
    >
      <div>
        {/* Contenido del formulario */}
        <div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="order-4">
              <label htmlFor="tx-form-account" className="label-base">Cuenta</label>
              <select
                id="tx-form-account"
                value={newTransaction.accountId}
                onChange={(e) => setNewTransaction({ ...newTransaction, accountId: e.target.value })}
                className="input-base"
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} {acc.isDefault ? UI_LABELS.forms.defaultAccount : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="order-1 lg:col-span-3">
              <span className="label-base" id="tx-form-type-label">Tipo</span>
              <div className="flex gap-2" role="group" aria-labelledby="tx-form-type-label">
                <button
                  type="button"
                  onClick={() => setNewTransaction({ ...newTransaction, type: 'expense', category: '', toAccountId: '' })}
                  className={`btn-type ${newTransaction.type === 'expense'
                    ? 'btn-type-active-destructive'
                    : 'btn-type-inactive'
                    }`}
                >
                  {UI_LABELS.transactionTypes.expense}
                </button>
                <button
                  type="button"
                  onClick={() => setNewTransaction({ ...newTransaction, type: 'income', category: '', toAccountId: '' })}
                  className={`btn-type ${newTransaction.type === 'income'
                    ? 'btn-type-active-success'
                    : 'btn-type-inactive'
                    }`}
                >
                  {isCreditCard ? 'Pagar' : UI_LABELS.transactionTypes.income}
                </button>
                {!isCreditCard && (
                  <button
                    type="button"
                    onClick={() => setNewTransaction({ ...newTransaction, type: 'transfer', category: TRANSFER_CATEGORY, toAccountId: '' })}
                    className={`btn-type ${newTransaction.type === 'transfer'
                      ? 'btn-type-active-info'
                      : 'btn-type-inactive'
                      }`}
                  >
                    {UI_LABELS.transactionTypes.transfer}
                  </button>
                )}
              </div>
            </div>

            <div className="order-2">
              <label htmlFor="tx-form-amount" className="label-base">Monto</label>
              <input
                id="tx-form-amount"
                type="text"
                inputMode="decimal"
                value={formatNumberForInput(newTransaction.amount)}
                onChange={(e) =>
                  setNewTransaction({ ...newTransaction, amount: unformatNumber(e.target.value) })
                }
                placeholder={selectedCurrency === 'USD' ? '0,00' : '0'}
                className="input-base"
              />
              {supportsForeignCurrency && (
                <div className="mt-2 flex gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-1">
                  {(['COP', 'USD'] as const).map((currency) => (
                    <button
                      key={currency}
                      type="button"
                      onClick={() => handleCurrencyChange(currency)}
                      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${selectedCurrency === currency
                        ? 'bg-white dark:bg-gray-700 text-blue-700 dark:text-blue-300 shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                        }`}
                      aria-pressed={selectedCurrency === currency}
                    >
                      {currency}
                    </button>
                  ))}
                </div>
              )}
              {isCreditCard && newTransaction.type === 'income' && creditUsed > 0 && (
                <p className="text-xs text-warning mt-1">
                  Deuda pendiente: {formatCurrency(creditUsed)}
                </p>
              )}
            </div>

            {supportsForeignCurrency && selectedCurrency === 'USD' && (
              <div className="order-5">
                <label htmlFor="tx-form-exchange-rate" className="label-base">TRM (Tasa Representativa del Mercado)</label>
                <div className="flex gap-2">
                  <input
                    id="tx-form-exchange-rate"
                    type="text"
                    inputMode="decimal"
                    value={formatNumberForInput(newTransaction.exchangeRate || '')}
                    onChange={(e) => handleExchangeRateChange(e.target.value)}
                    placeholder="4.000"
                    className="input-base"
                  />
                  <button
                    type="button"
                    onClick={handleUseOfficialTrm}
                    disabled={isFetchingTrm}
                    aria-busy={isFetchingTrm}
                    className="shrink-0 min-w-[96px] px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    {isFetchingTrm ? '...' : 'Usar oficial'}
                  </button>
                </div>
                <p
                  className={`text-xs mt-1 ${officialTrmError ? 'text-warning' : 'text-muted-foreground'}`}
                  aria-live="polite"
                >
                  {trmStatusText}
                </p>
              </div>
            )}

            <div className="order-3">
              <label htmlFor="tx-form-target" className="label-base">
                {newTransaction.type === 'transfer' ? 'Cuenta Destino'
                  : (isCreditCard && newTransaction.type === 'income') ? 'Desde qué cuenta'
                    : 'Categoría'}
              </label>
              {newTransaction.type === 'transfer' ? (
                <select
                  id="tx-form-target"
                  value={newTransaction.toAccountId}
                  onChange={(e) => setNewTransaction({ ...newTransaction, toAccountId: e.target.value })}
                  className="input-base"
                >
                  <option value="">{UI_LABELS.forms.selectDestination}</option>
                  {accounts.filter(acc => acc.id !== newTransaction.accountId).length === 0 ? (
                    <option value="" disabled>No hay otras cuentas disponibles</option>
                  ) : (
                    accounts
                      .filter(acc => acc.id !== newTransaction.accountId)
                      .map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                      ))
                  )}
                </select>
              ) : (isCreditCard && newTransaction.type === 'income') ? (
                <select
                  id="tx-form-target"
                  value={newTransaction.toAccountId}
                  onChange={(e) => setNewTransaction({ ...newTransaction, toAccountId: e.target.value })}
                  className="input-base"
                >
                  <option value="">Pago externo (sin cuenta origen)</option>
                  {accounts
                    .filter(acc => acc.id !== newTransaction.accountId && acc.type !== 'credit')
                    .map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))
                  }
                </select>
              ) : (
                <select
                  id="tx-form-target"
                  value={newTransaction.category}
                  onChange={(e) => setNewTransaction({ ...newTransaction, category: e.target.value })}
                  className="input-base"
                >
                  <option value="">{UI_LABELS.forms.selectCategory}</option>
                  {categories[newTransaction.type].map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              )}
            </div>

          </div>

          <div className="mt-4">
            <label htmlFor="tx-form-description" className="label-base">Descripción <span className="text-muted-foreground font-normal">(opcional)</span></label>
            <input
              id="tx-form-description"
              type="text"
              value={newTransaction.description}
              onChange={(e) => setNewTransaction({ ...newTransaction, description: e.target.value })}
              placeholder="Ej: Compra en supermercado"
              className="input-base"
            />
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => setIsDetailsOpen((open) => !open)}
              aria-expanded={isDetailsOpen}
              aria-controls="tx-form-additional-details"
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800"
            >
              <span className="flex items-center gap-2">
                <span>Más detalles</span>
                <span className="text-xs font-normal text-muted-foreground">{detailsDateLabel}</span>
              </span>
              <ChevronDown
                size={18}
                aria-hidden="true"
                className={`transition-transform ${isDetailsOpen ? 'rotate-180' : ''}`}
              />
            </button>
          </div>

          {isDetailsOpen && (
            <div id="tx-form-additional-details" className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="tx-form-date" className="label-base">Fecha</label>
                  <input
                    id="tx-form-date"
                    type="date"
                    value={newTransaction.date}
                    onChange={(e) => setNewTransaction({ ...newTransaction, date: e.target.value })}
                    className="input-base"
                  />
                </div>

                <div>
                  <label htmlFor="tx-form-beneficiary" className="label-base">Persona / Beneficiario</label>
                  <select
                    id="tx-form-beneficiary"
                    value={newTransaction.beneficiary || ''}
                    onChange={(e) => setNewTransaction({ ...newTransaction, beneficiary: e.target.value })}
                    className="input-base"
                  >
                    <option value="">Sin persona</option>
                    {beneficiaries.map((beneficiary) => (
                      <option key={beneficiary} value={beneficiary}>{beneficiary}</option>
                    ))}
                  </select>
                </div>
            </div>
          )}

          {/* Campos de cuotas e intereses - solo para gastos en TC */}
          {isCreditCard && newTransaction.type === 'expense' && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60">
              <button
                type="button"
                onClick={() => setIsInstallmentOpen((open) => !open)}
                aria-expanded={isInstallmentOpen}
                aria-controls="tx-form-installment-details"
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                <span className="flex items-center gap-2">
                  <CreditCard size={18} aria-hidden="true" className="text-blue-600 dark:text-blue-400" />
                  <span>
                Configuración de cuotas
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <span>{newTransaction.installments === 1 ? '1 cuota' : `${newTransaction.installments} cuotas`}</span>
                  <ChevronDown
                    size={18}
                    aria-hidden="true"
                    className={`transition-transform ${isInstallmentOpen ? 'rotate-180' : ''}`}
                  />
                </span>
              </button>

              {isInstallmentOpen && (
                <div id="tx-form-installment-details" className="border-t border-gray-200 px-4 pb-4 pt-3 dark:border-gray-700">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="tx-form-installments" className="label-base">Número de cuotas</label>
                  <select
                    id="tx-form-installments"
                    value={newTransaction.installments}
                    onChange={(e) => {
                      const installments = parseInt(e.target.value);
                      setNewTransaction({
                        ...newTransaction,
                        installments,
                        hasInterest: installments === 1 ? false : newTransaction.hasInterest
                      });
                    }}
                    className="input-base"
                  >
                    {INSTALLMENT_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="label-base" id="tx-form-purchase-type-label">Tipo de compra</span>
                  <div className="flex items-center gap-4 min-h-[42px]" role="group" aria-labelledby="tx-form-purchase-type-label">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newTransaction.hasInterest}
                        onChange={(e) => setNewTransaction({ ...newTransaction, hasInterest: e.target.checked })}
                        disabled={newTransaction.installments === 1}
                        className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Con intereses
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {installmentPreview?.missingRate ? (
                <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    <strong>Configura la tasa E.A. de la tarjeta</strong> para estimar los intereses de esta compra a cuotas.
                  </p>
                </div>
              ) : installmentPreview ? (
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                    {formatCurrency(installmentPreview.monthlyInstallmentAmount)}/mes durante {installmentPreview.installments} meses
                  </p>
                  <p className="text-xs text-blue-800 dark:text-blue-200 mt-1">
                    {installmentPreview.wantsInterest ? (
                      <>Interés total {formatCurrency(installmentPreview.totalInterestAmount)} · Total {formatCurrency(installmentPreview.totalAmount)} · E.A. {selectedAccount?.interestRate}%</>
                    ) : (
                      <>Sin intereses · Total {formatCurrency(installmentPreview.totalAmount)}</>
                    )}
                  </p>
                </div>
              ) : null}
                </div>
              )}
            </div>
          )}

          {/* 🆕 Asociar a pago periódico - Destacado visualmente */}
          {isDetailsOpen && newTransaction.type === 'expense' && recurringPayments.length > 0 && (
            <div className={`mt-4 rounded-lg border p-3 transition-colors ${newTransaction.recurringPaymentId
              ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700'
              : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
              }`}>
              <label htmlFor="tx-form-recurring" className="label-base flex items-center gap-2 mb-2">
                <Repeat size={18} className={newTransaction.recurringPaymentId ? 'text-purple-600' : 'text-gray-400'} />
                <span className={newTransaction.recurringPaymentId ? 'text-purple-700 dark:text-purple-300' : ''}>
                  ¿Es un pago periódico?
                </span>
              </label>
              <select
                id="tx-form-recurring"
                value={newTransaction.recurringPaymentId || ''}
                onChange={(e) => {
                  const paymentId = e.target.value || undefined;
                  const payment = recurringPayments.find(p => p.id === paymentId);
                  setNewTransaction({
                    ...newTransaction,
                    recurringPaymentId: paymentId,
                    // Auto-completar campos si selecciona un pago (excepto cuenta - el usuario elige)
                    ...(payment && {
                      category: payment.category,
                      description: payment.name,
                      amount: payment.amount.toString(),
                      currency: 'COP',
                      exchangeRate: '',
                    })
                  });
                }}
                className="input-base"
              >
                <option value="">No, es un gasto normal</option>
                <optgroup label="Mis pagos periódicos">
                  {recurringPayments.filter(p => p.isActive).map(payment => (
                    <option key={payment.id} value={payment.id}>
                      🔄 {payment.name} ({formatCurrency(payment.amount)}/mes)
                    </option>
                  ))}
                </optgroup>
              </select>
              {newTransaction.recurringPaymentId && (
                <div className="mt-2 flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400">
                  <span className="inline-block h-2 w-2 rounded-full bg-purple-500"></span>
                  Se marcará como pagado para este mes
                </div>
              )}
            </div>
          )}

          {/* ⚠️ Alerta de posible duplicado (solo aparece al intentar enviar) */}
          {pendingDuplicates.length > 0 && (
            <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    Posible duplicado detectado
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {pendingDuplicates.map((dup, i) => (
                      <div key={i} className="text-xs text-warning bg-warning-muted p-2 rounded-lg">
                        <span className="font-medium">{formatCurrency(dup.transaction.amount)}</span>
                        {' — '}
                        {dup.transaction.description || dup.transaction.category}
                        {' · '}
                        <span className="text-warning">
                          {formatDate(dup.transaction.date)}
                        </span>
                        <span className="ml-2 text-warning italic">
                          ({dup.reasons.join(', ')})
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3 mt-3">
                    <button
                      onClick={handleConfirmDuplicate}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-warning-muted text-warning border border-warning transition-colors hover:opacity-80"
                    >
                      No es duplicado, agregar de todos modos
                    </button>
                    <button
                      onClick={handleCancelDuplicate}
                      className="text-xs font-medium text-warning hover:opacity-80 underline underline-offset-2"
                    >
                      {UI_TEXT.actions.cancel}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
        {/* Fin contenido del formulario */}

        {/* Footer — barra de acciones fija al fondo del modal.
            Se pega al borde inferior del contenedor scrollable de BaseModal.
            Los márgenes negativos compensan el padding (p-4 sm:p-6) del wrapper
            de children para que el fondo sólido cubra todo el ancho y llegue
            hasta el borde inferior sin dejar hueco. */}
        <div className="sticky bottom-0 z-10 -mx-4 -mb-4 sm:-mx-6 sm:-mb-6 mt-4 px-4 sm:px-6 py-4 flex flex-wrap gap-3 border-t border-gray-100 dark:border-gray-700 items-center bg-white dark:bg-gray-800">
          <button onClick={() => checkDuplicatesAndSubmit('submit')} className="btn-submit">
            {UI_TEXT.actions.add}
          </button>
          {onSubmitAndContinue && (
            <button
              onClick={() => checkDuplicatesAndSubmit('continue')}
              aria-label="Agregar y continuar"
              title="Agregar y seguir ingresando (mantiene cuenta y fecha)"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-solid text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              <Zap size={18} aria-hidden="true" />
            </button>
          )}
          <button onClick={onCancel} className="btn-cancel">
            {UI_TEXT.actions.cancel}
          </button>
          {batchCount > 0 && (
            <span className="ml-auto text-sm text-purple-600 dark:text-purple-400 font-medium bg-purple-50 dark:bg-purple-900/30 px-3 py-1.5 rounded-full">
              {batchCount} agregada{batchCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </BaseModal>
  );
});

TransactionForm.displayName = 'TransactionForm';
