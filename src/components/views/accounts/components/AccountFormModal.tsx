'use client';

import React, { useState } from 'react';
import { Wallet } from 'lucide-react';
import { BaseModal } from '../../../modals/BaseModal';
import type { Account, NewAccount } from '../../../../types/finance';

interface AccountType {
  value: 'savings' | 'credit' | 'cash';
  label: string;
}

interface AccountFormModalProps {
  isOpen: boolean;
  /** Guardado en curso: deshabilita el submit y muestra "Guardando…" (anti doble-submit). */
  isSubmitting?: boolean;
  editingAccount: Account | null;
  newAccount: NewAccount;
  balanceAdjustment: string;
  initialBalanceInput: string;
  creditLimitInput: string;
  interestRateInput: string;
  savingsAccounts: Account[];
  accountTypes: AccountType[];
  setNewAccount: (account: NewAccount) => void;
  setBalanceAdjustment: (value: string) => void;
  setInitialBalanceInput: (value: string) => void;
  setCreditLimitInput: (value: string) => void;
  setInterestRateInput: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  formatNumberForInput: (value: string) => string;
  unformatNumber: (value: string) => string;
  formatCurrency: (amount: number) => string;
  getAccountBalance: (id: string) => number;
  getCreditUsed: (id: string) => number;
}

/**
 * Modal para crear o editar una cuenta
 */
export const AccountFormModal: React.FC<AccountFormModalProps> = ({
  isOpen,
  isSubmitting = false,
  editingAccount,
  newAccount,
  balanceAdjustment,
  initialBalanceInput,
  creditLimitInput,
  interestRateInput,
  savingsAccounts,
  accountTypes,
  setNewAccount,
  setBalanceAdjustment,
  setInitialBalanceInput,
  setCreditLimitInput,
  setInterestRateInput,
  onClose,
  onSubmit,
  formatNumberForInput,
  unformatNumber,
  formatCurrency,
  getAccountBalance,
  getCreditUsed,
}) => {
  // Validación inline del nombre: el toast por sí solo no anuncia el campo
  // inválido para lectores de pantalla ni lo marca visualmente. Se activa al
  // primer intento de guardar (submitAttempted), no en cada tecla.
  const [submitAttempted, setSubmitAttempted] = useState(false);

  if (!isOpen) return null;

  const nameInvalid = submitAttempted && !newAccount.name.trim();

  const handleSubmit = () => {
    setSubmitAttempted(true);
    onSubmit();
  };

  // Clamp 1..31 para día de corte/pago: parseInt sobre un input vacío o no
  // numérico daba NaN, que luego se enmascaraba con ||1/||10. Acotar aquí evita
  // valores fuera de rango y NaN en el estado.
  const clampDay = (value: string) => Math.min(31, Math.max(1, parseInt(value, 10) || 1));

  // Preview en vivo del ajuste: usa EXACTAMENTE el mismo parseo y la misma fuente
  // de saldo/deuda que handleSubmit, para que el usuario vea el saldo actual, el
  // nuevo y el ajuste que se creará ANTES de confirmar (transparencia + evita
  // sorpresas si el saldo computado no es el esperado).
  const adjustPreview = (() => {
    if (!editingAccount || balanceAdjustment.trim() === '') return null;
    const target = parseFloat(balanceAdjustment.trim().replace(/\./g, '').replace(',', '.'));
    if (isNaN(target) || target < 0) return null;
    const current = editingAccount.type === 'credit'
      ? getCreditUsed(editingAccount.id!)
      : getAccountBalance(editingAccount.id!);
    return { current, target, delta: target - current };
  })();

  const renderAdjustPreview = () => {
    if (!adjustPreview || !editingAccount) return null;
    const isCredit = editingAccount.type === 'credit';
    return (
      <div className="mt-2 text-xs rounded-lg bg-muted/40 border border-border p-2 space-y-0.5">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{isCredit ? 'Deuda actual' : 'Saldo actual'}</span>
          <span className="font-medium text-foreground">{formatCurrency(adjustPreview.current)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Nuevo</span>
          <span className="font-medium text-foreground">{formatCurrency(adjustPreview.target)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Ajuste a crear</span>
          <span className={`font-semibold ${adjustPreview.delta >= 0 ? 'text-success' : 'text-destructive'}`}>
            {adjustPreview.delta >= 0 ? '+' : ''}{formatCurrency(adjustPreview.delta)}
          </span>
        </div>
      </div>
    );
  };

  const handleInterestRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const numericOnly = value.replace(/[^0-9]/g, '');
    const limited = numericOnly.slice(0, 4);
    let formatted = limited;
    if (limited.length > 2) {
      formatted = limited.slice(0, -2) + ',' + limited.slice(-2);
    }
    setInterestRateInput(formatted);
    if (limited === '') {
      setNewAccount({ ...newAccount, interestRate: 0 });
    } else {
      const decimalValue = parseInt(limited, 10) / 100;
      setNewAccount({ ...newAccount, interestRate: decimalValue });
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      closeOnBackdrop={false}
      title={editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta'}
      titleIcon={<Wallet size={20} className="text-primary" />}
      maxWidth="max-w-2xl"
    >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Nombre (siempre visible) */}
            <div>
              <label htmlFor="af-name" className="label-base">Nombre</label>
              <input
                id="af-name"
                type="text"
                value={newAccount.name}
                onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                placeholder="Ej: Banco"
                className="input-base"
                aria-invalid={nameInvalid}
                aria-describedby={nameInvalid ? 'af-name-error' : undefined}
              />
              {nameInvalid && (
                <p id="af-name-error" className="text-xs text-destructive mt-1">
                  El nombre de la cuenta no puede estar vacío.
                </p>
              )}
            </div>

            {/* Campos para EDICIÓN de tarjeta de crédito */}
            {editingAccount && editingAccount.type === 'credit' && (
              <>
                <div>
                  <label htmlFor="af-credit-limit-edit" className="label-base">Límite de Crédito</label>
                  <input
                    id="af-credit-limit-edit"
                    type="text"
                    inputMode="decimal"
                    value={formatNumberForInput(creditLimitInput)}
                    onChange={(e) => {
                      const unformatted = unformatNumber(e.target.value);
                      setCreditLimitInput(unformatted);
                      const numValue = parseFloat(unformatted.replace(',', '.')) || 0;
                      setNewAccount({ ...newAccount, creditLimit: numValue });
                    }}
                    placeholder="0"
                    className="input-base"
                  />
                </div>
                <div>
                  <label htmlFor="af-interest-rate-edit" className="label-base">Tasa de Interés E.A. (%)</label>
                  <input
                    id="af-interest-rate-edit"
                    type="text"
                    inputMode="numeric"
                    value={interestRateInput}
                    onChange={handleInterestRateChange}
                    placeholder="23,99"
                    className="input-base"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Opcional. Se usa para calcular intereses en cuotas.
                  </p>
                </div>
              </>
            )}

            {/* Ajuste de saldo para cuentas que no son TC */}
            {editingAccount && editingAccount.type !== 'credit' && (
              <div>
                <label htmlFor="af-balance-adj" className="label-base">Ajustar saldo (opcional)</label>
                <input
                  id="af-balance-adj"
                  type="text"
                  inputMode="decimal"
                  value={formatNumberForInput(balanceAdjustment)}
                  placeholder={`Saldo actual: ${formatCurrency(getAccountBalance(editingAccount.id!))}`}
                  onChange={(e) => {
                    const unformatted = unformatNumber(e.target.value);
                    setBalanceAdjustment(unformatted);
                  }}
                  className="input-base"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Ingresa el nuevo saldo deseado. Se creará un ajuste automático.
                </p>
                {renderAdjustPreview()}
              </div>
            )}

            {/* Ajuste de deuda para TC */}
            {editingAccount && editingAccount.type === 'credit' && (
              <div>
                <label htmlFor="af-debt-adj" className="label-base">Ajustar deuda pendiente (opcional)</label>
                <input
                  id="af-debt-adj"
                  type="text"
                  inputMode="decimal"
                  value={formatNumberForInput(balanceAdjustment)}
                  placeholder={`Deuda actual: ${formatCurrency(getCreditUsed(editingAccount.id!))}`}
                  onChange={(e) => {
                    const unformatted = unformatNumber(e.target.value);
                    setBalanceAdjustment(unformatted);
                  }}
                  className="input-base"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Ingresa el monto real que debes. Se creará un ajuste automático.
                </p>
                {renderAdjustPreview()}
              </div>
            )}

            {/* Campos para CREACIÓN */}
            {!editingAccount && (
              <>
                <div>
                  <label htmlFor="af-type" className="label-base">Tipo</label>
                  <select
                    id="af-type"
                    value={newAccount.type}
                    onChange={(e) =>
                      setNewAccount({
                        ...newAccount,
                        type: e.target.value as 'savings' | 'credit' | 'cash',
                      })
                    }
                    className="input-base"
                  >
                    {accountTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                {newAccount.type !== 'credit' ? (
                  <div>
                    <label htmlFor="af-initial-balance" className="label-base">Saldo inicial</label>
                    <input
                      id="af-initial-balance"
                      type="text"
                      inputMode="decimal"
                      value={formatNumberForInput(initialBalanceInput)}
                      onChange={(e) => {
                        const unformatted = unformatNumber(e.target.value);
                        setInitialBalanceInput(unformatted);
                        const numValue = parseFloat(unformatted.replace(',', '.')) || 0;
                        setNewAccount({ ...newAccount, initialBalance: numValue });
                      }}
                      placeholder="0"
                      className="input-base"
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label htmlFor="af-bank-account" className="label-base">Banco asociado (opcional)</label>
                      <select
                        id="af-bank-account"
                        value={newAccount.bankAccountId || ''}
                        onChange={(e) =>
                          setNewAccount({
                            ...newAccount,
                            bankAccountId: e.target.value || undefined,
                          })
                        }
                        className="input-base"
                      >
                        <option value="">Sin asociar</option>
                        {savingsAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="af-credit-limit" className="label-base">Cupo total</label>
                      <input
                        id="af-credit-limit"
                        type="text"
                        inputMode="decimal"
                        value={formatNumberForInput(creditLimitInput)}
                        onChange={(e) => {
                          const unformatted = unformatNumber(e.target.value);
                          setCreditLimitInput(unformatted);
                          const numValue = parseFloat(unformatted.replace(',', '.')) || 0;
                          setNewAccount({ ...newAccount, creditLimit: numValue });
                        }}
                        placeholder="0"
                        className="input-base"
                      />
                    </div>

                    <div>
                      <label htmlFor="af-interest-rate" className="label-base">Tasa de Interés E.A. (%)</label>
                      <input
                        id="af-interest-rate"
                        type="text"
                        inputMode="numeric"
                        value={interestRateInput}
                        onChange={handleInterestRateChange}
                        placeholder="23,99"
                        className="input-base"
                      />
                    </div>

                    <div>
                      <label htmlFor="af-cutoff-day" className="label-base">Día de corte</label>
                      <input
                        id="af-cutoff-day"
                        type="number"
                        min="1"
                        max="31"
                        value={newAccount.cutoffDay}
                        onChange={(e) =>
                          setNewAccount({ ...newAccount, cutoffDay: clampDay(e.target.value) })
                        }
                        className="input-base"
                      />
                    </div>

                    <div>
                      <label htmlFor="af-payment-day" className="label-base">Día de pago</label>
                      <input
                        id="af-payment-day"
                        type="number"
                        min="1"
                        max="31"
                        value={newAccount.paymentDay}
                        onChange={(e) =>
                          setNewAccount({ ...newAccount, paymentDay: clampDay(e.target.value) })
                        }
                        className="input-base"
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="btn-submit disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Guardando…' : editingAccount ? 'Actualizar' : 'Crear'}
            </button>
            <button onClick={onClose} disabled={isSubmitting} className="btn-cancel disabled:opacity-50 disabled:cursor-not-allowed">
              Cancelar
            </button>
          </div>
    </BaseModal>
  );
};
