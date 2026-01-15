'use client';

import React from 'react';
import { X } from 'lucide-react';
import type { Account, NewAccount } from '../../../../types/finance';

interface AccountType {
  value: 'savings' | 'credit' | 'cash';
  label: string;
}

interface AccountFormModalProps {
  isOpen: boolean;
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
}

/**
 * Modal para crear o editar una cuenta
 */
export const AccountFormModal: React.FC<AccountFormModalProps> = ({
  isOpen,
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
}) => {
  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta'}
            </h4>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X size={24} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Nombre (siempre visible) */}
            <div>
              <label className="label-base">Nombre</label>
              <input
                type="text"
                value={newAccount.name}
                onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                placeholder="Ej: Banco"
                className="input-base"
              />
            </div>

            {/* Campos para EDICIÓN de tarjeta de crédito */}
            {editingAccount && editingAccount.type === 'credit' && (
              <>
                <div>
                  <label className="label-base">Límite de Crédito</label>
                  <input
                    type="text"
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
                  <label className="label-base">Tasa de Interés E.A. (%)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={interestRateInput}
                    onChange={handleInterestRateChange}
                    placeholder="23,99"
                    className="input-base"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Opcional. Se usa para calcular intereses en cuotas.
                  </p>
                </div>
              </>
            )}

            {/* Ajuste de saldo para cuentas que no son TC */}
            {editingAccount && editingAccount.type !== 'credit' && (
              <div>
                <label className="label-base">Ajustar saldo (opcional)</label>
                <input
                  type="text"
                  value={formatNumberForInput(balanceAdjustment)}
                  placeholder={`Saldo actual: ${formatCurrency(getAccountBalance(editingAccount.id!))}`}
                  onChange={(e) => {
                    const unformatted = unformatNumber(e.target.value);
                    setBalanceAdjustment(unformatted);
                  }}
                  className="input-base"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Ingresa el nuevo saldo deseado. Se creará un ajuste automático.
                </p>
              </div>
            )}

            {/* Campos para CREACIÓN */}
            {!editingAccount && (
              <>
                <div>
                  <label className="label-base">Tipo</label>
                  <select
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
                    <label className="label-base">Saldo inicial</label>
                    <input
                      type="text"
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
                      <label className="label-base">Banco asociado (opcional)</label>
                      <select
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
                      <label className="label-base">Cupo total</label>
                      <input
                        type="text"
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
                      <label className="label-base">Tasa de Interés E.A. (%)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={interestRateInput}
                        onChange={handleInterestRateChange}
                        placeholder="23,99"
                        className="input-base"
                      />
                    </div>

                    <div>
                      <label className="label-base">Día de corte</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={newAccount.cutoffDay}
                        onChange={(e) =>
                          setNewAccount({ ...newAccount, cutoffDay: parseInt(e.target.value) })
                        }
                        className="input-base"
                      />
                    </div>

                    <div>
                      <label className="label-base">Día de pago</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={newAccount.paymentDay}
                        onChange={(e) =>
                          setNewAccount({ ...newAccount, paymentDay: parseInt(e.target.value) })
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
            <button onClick={onSubmit} className="btn-submit">
              {editingAccount ? 'Actualizar' : 'Crear'}
            </button>
            <button onClick={onClose} className="btn-cancel">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
