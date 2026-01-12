import React from 'react';
import { X } from 'lucide-react';
import { UI_LABELS } from '../config/constants';
import { formatNumberForInput, unformatNumber } from '../utils/formatters';
import type { NewTransaction, Account, Categories } from '../types/finance';

interface TransactionFormProps {
  newTransaction: NewTransaction;
  setNewTransaction: (tx: NewTransaction) => void;
  accounts: Account[];
  categories: Categories;
  defaultAccount: Account | null;
  onSubmit: () => void;
  onCancel: () => void;
}

export const TransactionForm: React.FC<TransactionFormProps> = ({
  newTransaction,
  setNewTransaction,
  accounts,
  categories,
  defaultAccount,
  onSubmit,
  onCancel
}) => {
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Nueva Transacción</h3>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X size={24} />
            </button>
          </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="label-base">Cuenta</label>
          <select
            value={newTransaction.accountId}
            onChange={(e) => setNewTransaction({...newTransaction, accountId: e.target.value})}
            className="input-base"
          >
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.name} {acc.isDefault ? UI_LABELS.forms.defaultAccount : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label-base">Tipo</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setNewTransaction({...newTransaction, type: 'expense', category: '', toAccountId: ''})}
              className={`btn-type ${
                newTransaction.type === 'expense'
                  ? 'btn-type-active-destructive'
                  : 'btn-type-inactive'
              }`}
            >
              {UI_LABELS.transactionTypes.expense}
            </button>
            <button
              type="button"
              onClick={() => setNewTransaction({...newTransaction, type: 'income', category: '', toAccountId: ''})}
              className={`btn-type ${
                newTransaction.type === 'income'
                  ? 'btn-type-active-success'
                  : 'btn-type-inactive'
              }`}
            >
              {UI_LABELS.transactionTypes.income}
            </button>
            <button
              type="button"
              onClick={() => setNewTransaction({...newTransaction, type: 'transfer', category: 'Transferencia', toAccountId: ''})}
              className={`btn-type ${
                newTransaction.type === 'transfer'
                  ? 'btn-type-active-info'
                  : 'btn-type-inactive'
              }`}
            >
              {UI_LABELS.transactionTypes.transfer}
            </button>
          </div>
        </div>

        <div>
          <label className="label-base">Monto</label>
          <input
            type="text"
            value={formatNumberForInput(newTransaction.amount)}
            onChange={(e) => {
              const unformatted = unformatNumber(e.target.value);
              setNewTransaction({...newTransaction, amount: unformatted});
            }}
            placeholder="0"
            className="input-base"
          />
        </div>

        <div>
          <label className="label-base">
            {newTransaction.type === 'transfer' ? 'Cuenta Destino' : 'Categoría'}
          </label>
          {newTransaction.type === 'transfer' ? (
            <select
              value={newTransaction.toAccountId}
              onChange={(e) => setNewTransaction({...newTransaction, toAccountId: e.target.value})}
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
          ) : (
            <select
              value={newTransaction.category}
              onChange={(e) => setNewTransaction({...newTransaction, category: e.target.value})}
              className="input-base"
            >
              <option value="">{UI_LABELS.forms.selectCategory}</option>
              {categories[newTransaction.type].map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="label-base">Fecha</label>
          <input
            type="date"
            value={newTransaction.date}
            onChange={(e) => setNewTransaction({...newTransaction, date: e.target.value})}
            className="input-base"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="label-base">Descripción</label>
        <input
          type="text"
          value={newTransaction.description}
          onChange={(e) => setNewTransaction({...newTransaction, description: e.target.value})}
          placeholder="Ej: Compra en supermercado"
          className="input-base"
        />
      </div>

          <div className="flex gap-3 mt-6">
            <button onClick={onSubmit} className="btn-submit">
              Agregar
            </button>
            <button onClick={onCancel} className="btn-cancel">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};