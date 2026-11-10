import React from 'react';
import { ChevronDown } from 'lucide-react';
import type { Account, Debt } from '../../../../types/finance';
import { getDebtTotalAmount } from '../../../../utils/debtInterest';
import { formatDate } from '../../../../utils/formatters';
import { ensureDate } from '../../../../utils/dateUtils';
import { calculateMonthlyInterestCharge } from '../../../../../functions/src/shared/debtMonthlyInterest';

export function DebtFinancialDetails({ debt, account, formatAmount }: {
  debt: Debt; account?: Account; formatAmount: (amount: number) => string;
}) {
  const isMonthly = debt.interestAccrual === 'monthly';
  const monthlyCharge = isMonthly && (debt.interestMode === 'card' || debt.interestMode === 'percentage') && debt.interestRate !== undefined
    ? calculateMonthlyInterestCharge(debt.originalAmount, debt.interestMode, debt.interestRate) : undefined;

  const hasInterestDetails = isMonthly || (debt.totalInterestAmount ?? 0) > 0 || Boolean(debt.interestMode);

  const accountLabel = account ? (
    <>
      {account.type === 'credit' ? 'Tarjeta' : 'Cuenta'}:{' '}
      <span className="font-medium text-foreground">{account.name}</span>
      {debt.installments && (
        <span> · {debt.installments} cuota{debt.installments !== 1 ? 's' : ''}</span>
      )}
      {debt.interestRate !== undefined && (
        <span> · {debt.interestRate.toLocaleString('es-CO')}% {debt.interestMode === 'card' ? 'E.A.' : 'mensual'}</span>
      )}
    </>
  ) : null;

  return (
    <div className="mt-1 text-xs text-muted-foreground">
      {!hasInterestDetails && accountLabel && (
        <p className="break-words">{accountLabel}</p>
      )}

      {hasInterestDetails && (
        <details className="group">
          <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 list-none [&::-webkit-details-marker]:hidden">
            {accountLabel && (
              <span className="break-words">
                {accountLabel} ·
              </span>
            )}
            <span className="inline-flex items-center gap-0.5 underline decoration-border underline-offset-2 hover:text-foreground">
              <span>Ver desglose de interés</span>
              <ChevronDown size={12} className="transition-transform group-open:rotate-180" aria-hidden="true" />
            </span>
          </summary>
          <div className="mt-1.5 space-y-1 rounded-lg border border-border bg-muted/40 p-2.5">
            {isMonthly ? (
              <>
                <p>Interés mensual{debt.isSettled ? ' finalizado' : ''} · Día {debt.interestCutoffDay}{debt.interestRate !== undefined ? ` · ${debt.interestRate.toLocaleString('es-CO')}% ${debt.interestMode === 'card' ? 'E.A.' : 'mensual'}` : ''}</p>
                <p>Siempre sobre el capital original, sin interés compuesto; los abonos no cambian la base.</p>
                {monthlyCharge !== undefined && <p>Interés por cada corte: <span className="font-mono text-foreground">{formatAmount(monthlyCharge)}</span></p>}
                {!debt.isSettled && debt.nextInterestDate && <p>Próximo corte: <span className="text-foreground">{formatDate(ensureDate(debt.nextInterestDate))}</span></p>}
              </>
            ) : debt.interestMode && <p>Interés: todo al registrar</p>}
            {(isMonthly || (debt.totalInterestAmount ?? 0) > 0) && (
              <dl className="flex flex-wrap gap-x-4 gap-y-1">
                <div><dt className="inline">Capital: </dt><dd className="inline font-mono text-foreground">{formatAmount(debt.originalAmount)}</dd></div>
                <div><dt className="inline">{isMonthly ? 'Interés acumulado' : debt.isSettled ? 'Interés acordado' : debt.type === 'lent' ? 'Interés total a cobrar' : 'Interés total a pagar'}: </dt><dd className="inline font-mono text-foreground">{formatAmount(debt.totalInterestAmount ?? 0)}</dd></div>
                <div><dt className="inline">{isMonthly ? 'Capital + interés acumulado' : 'Total acordado'}: </dt><dd className="inline font-mono text-foreground">{formatAmount(getDebtTotalAmount(debt))}</dd></div>
              </dl>
            )}
            {debt.installments && <p>{isMonthly ? 'Financiación original: ' : ''}{debt.installments} cuota{debt.installments !== 1 ? 's' : ''}{debt.monthlyInstallmentAmount ? ` · ${formatAmount(debt.monthlyInstallmentAmount)} por cuota (referencia)` : ''}{!isMonthly && debt.interestRate !== undefined && debt.interestMode === 'card' ? ` · ${debt.interestRate.toLocaleString('es-CO')}% E.A. al registrar` : ''}</p>}
          </div>
        </details>
      )}
    </div>
  );
}
