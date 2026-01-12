import React from 'react';
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
    <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-5 mb-6 border border-purple-200">
      <h3 className="text-lg font-semibold mb-4 text-gray-900">Nueva Transacción</h3>

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
                {acc.name} {acc.isDefault ? '(Por defecto)' : ''}
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
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                newTransaction.type === 'expense'
                  ? 'bg-rose-100 text-rose-700 border-2 border-rose-300'
                  : 'bg-gray-100 text-gray-600 border-2 border-gray-200 hover:bg-gray-200'
              }`}
            >
              Gasto
            </button>
            <button
              type="button"
              onClick={() => setNewTransaction({...newTransaction, type: 'income', category: '', toAccountId: ''})}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                newTransaction.type === 'income'
                  ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-300'
                  : 'bg-gray-100 text-gray-600 border-2 border-gray-200 hover:bg-gray-200'
              }`}
            >
              Ingreso
            </button>
            <button
              type="button"
              onClick={() => setNewTransaction({...newTransaction, type: 'transfer', category: 'Transferencia', toAccountId: ''})}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                newTransaction.type === 'transfer'
                  ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                  : 'bg-gray-100 text-gray-600 border-2 border-gray-200 hover:bg-gray-200'
              }`}
            >
              Transferencia
            </button>
          </div>
        </div>

        <div>
          <label className="label-base">Monto</label>
          <input
            type="number"
            value={newTransaction.amount}
            onChange={(e) => setNewTransaction({...newTransaction, amount: e.target.value})}
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
              <option value="">Seleccionar cuenta destino...</option>
              {accounts
                .filter(acc => acc.id !== newTransaction.accountId)
                .map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
            </select>
          ) : (
            <select
              value={newTransaction.category}
              onChange={(e) => setNewTransaction({...newTransaction, category: e.target.value})}
              className="input-base"
            >
              <option value="">Seleccionar...</option>
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
        <label className="block mb-1.5 text-sm font-medium text-gray-700">Descripción</label>
        <input
          type="text"
          value={newTransaction.description}
          onChange={(e) => setNewTransaction({...newTransaction, description: e.target.value})}
          placeholder="Ej: Compra en supermercado"
          className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>

      <div className="flex gap-3 mt-4">
        <button onClick={onSubmit} className="btn-submit">
          Agregar
        </button>
        <button onClick={onCancel} className="btn-cancel">
          Cancelar
        </button>
      </div>
    </div>
  );
};